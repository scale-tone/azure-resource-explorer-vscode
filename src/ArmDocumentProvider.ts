import * as vscode from 'vscode';
import { AzureAccountWrapper } from './AzureAccountWrapper';
import axios from 'axios';
import { ResourceTypesRepository } from './ResourceTypesRepository';

export const READONLY_JSON_SCHEME = 'azure-resource-explorer-vscode-readonly-json';

// Renders ARM JSON as text
export class ArmDocumentProvider implements vscode.TextDocumentContentProvider {

    constructor(private _account: AzureAccountWrapper, private _resourceTypeRepository: ResourceTypesRepository) {}
    
    onDidChange?: vscode.Event<vscode.Uri> | undefined;

    async provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {

        try {

            if (uri.scheme !== READONLY_JSON_SCHEME) {
                throw new Error(`Incorrect scheme (${uri.scheme})`);
            }

            const resourceId = uri.path.substring(0, uri.path.length - '.json'.length);

            const apiVersion = await this._resourceTypeRepository.getApiVersion(resourceId);

            const response = await axios.get(
                `https://management.azure.com${resourceId}?api-version=${apiVersion}`,
                { headers: { 'Authorization': `Bearer ${await this._account.getToken()}` } }
            );
    
            return JSON.stringify(response.data, undefined, 3);
                
        } catch (err: any) {

            vscode.window.showErrorMessage(`Failed to show the code. ${err.message ?? err}`);
            return '';
        }
    }
}