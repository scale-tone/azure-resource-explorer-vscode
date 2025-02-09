import * as vscode from 'vscode';
import { AzureAccountWrapper } from './AzureAccountWrapper';
import { ResourceTypesRepository } from './ResourceTypesRepository';

export const ARM_SCHEME = 'azure-resource-explorer-vscode-arm-template';

type ArmFileType = { resourceId: string, bytes: Uint8Array, ctime: number, mtime: number };

// Treats ARM resources as files
export class ArmFsProvider implements vscode.FileSystemProvider {

    constructor(private _account: AzureAccountWrapper, private _resourceTypeRepository: ResourceTypesRepository, private _context: vscode.ExtensionContext) {
    }

    async show(resourceId: string): Promise<void> {

        // No deterministic way to detect a text document being closed, so instead we just do a periodic cleanup
        this.cleanup();

        const progressOptions = {
            location: vscode.ProgressLocation.Notification,
            title: `GET ${resourceId}`
        };

        await vscode.window.withProgress(progressOptions, async (progress, token) => {

            const apiVersion = await this._resourceTypeRepository.getApiVersion(resourceId);
            const data = await this._account.query(encodeURI(resourceId), apiVersion, this._context);
            const json = JSON.stringify(data, undefined, 3);

            const fileUri = `${ARM_SCHEME}:${resourceId}.json`;
            this._files[fileUri] = {
                resourceId,
                bytes: Buffer.from(json),
                ctime: Date.now(),
                mtime: Date.now()
            };

            const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(fileUri));
            await vscode.window.showTextDocument(doc, { preview: false });

            // To make sure the editor gets updated
            this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri: vscode.Uri.parse(fileUri) }]);
        });
    }

    stat(uri: vscode.Uri): vscode.FileStat {

        const file = this._files[decodeURI(uri.toString())];
        if (!file) {
            throw new Error(`${uri} wasn't loaded`);
        }

        return {
            type: vscode.FileType.File,
            ctime: file.ctime,
            mtime: file.mtime,
            size: file.bytes.length
        };
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {

        const file = this._files[decodeURI(uri.toString())];
        if (!file) {
            throw new Error(`${uri} wasn't loaded`);
        }

        return file.bytes;
    }

    async applyJson(resourceId: string | undefined, jsonString: string): Promise<any> {

        const json = JSON.parse(jsonString);

        const apiVersion = await this._resourceTypeRepository.getApiVersion(resourceId!);

        resourceId = await vscode.window.showInputBox({ value: resourceId, title: 'Check/modify the path to apply changes to' });
        if (!resourceId) {
            return;
        }

        const method = await vscode.window.showQuickPick(['PATCH', 'PUT'], { title: 'Select an HTTP method to use. Some resources expect PATCH, others might require PUT. See https://learn.microsoft.com/en-us/rest/api/azure for details.' });
        if (!method) {
            return;
        }

        const progressOptions = {
            location: vscode.ProgressLocation.Notification,
            title: `${method} ${resourceId}`
        };

        return await vscode.window.withProgress(progressOptions, async (progress, token) => {

            const response = await this._account.apply(method, encodeURI(resourceId!), json, apiVersion);

            vscode.window.showInformationMessage(`${method} ${resourceId} returned ${response.status}`);

            return response.data;
        });
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array, options: { readonly create: boolean; readonly overwrite: boolean; }): Promise<void> {

        const file = this._files[decodeURI(uri.toString())];
        if (!file) {
            throw new Error(`${uri} wasn't loaded`);
        }

        const json = content.toString();
        if (json === file.bytes.toString()) {
            return;
        }

        const result = await this.applyJson(file.resourceId, json);

        if (!result) {

            throw new Error(`Cancelled applying changes`);
        }

        file.bytes = Buffer.from(JSON.stringify(result, undefined, 3));
        file.mtime = Date.now();
        this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    }

    watch(uri: vscode.Uri, options: { readonly recursive: boolean; readonly excludes: readonly string[]; }): vscode.Disposable {
        throw new Error('Method not implemented.');
    }
    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
        throw new Error('Method not implemented.');
    }
    createDirectory(uri: vscode.Uri): void | Thenable<void> {
        throw new Error('Method not implemented.');
    }
    delete(uri: vscode.Uri, options: { readonly recursive: boolean; }): void | Thenable<void> {
        throw new Error('Method not implemented.');
    }
    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { readonly overwrite: boolean; }): void | Thenable<void> {
        throw new Error('Method not implemented.');
    }
    copy?(source: vscode.Uri, destination: vscode.Uri, options: { readonly overwrite: boolean; }): void | Thenable<void> {
        throw new Error('Method not implemented.');
    }

    private readonly _files: { [uri: string]: ArmFileType } = {};

    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

    private cleanup() {

        const visibleUris = vscode.workspace.textDocuments.map(d => d.uri.toString().toLowerCase());

        const uris = Object.keys(this._files);

        for (const uri of uris) {

            if (!visibleUris.includes(uri.toLowerCase())) {
                delete this._files[uri];
            }
        }
    }
}