import * as vscode from 'vscode';

import axios, { AxiosResponse } from 'axios';

// Full typings for this can be found here: https://github.com/microsoft/vscode-azure-account/blob/master/src/azure-account.api.d.ts
export type AzureSubscription = { session: { credentials2: any }, subscription: { subscriptionId: string, displayName: string } };

export interface TokenResponse {
    tokenType: string;
    expiresIn: number;
    expiresOn: Date | string;
    resource: string;
    accessToken: string;
    refreshToken?: string;
}

export const ARM_URL = `https://management.azure.com`;
export const DEFAULT_API_VERSION = '2023-07-01';

const MAX_BATCHES = 100;

// Wraps Azure Acccount extension
export class AzureAccountWrapper {

    constructor() {

        // Using Azure Account extension to connect to Azure, get subscriptions etc.
        const azureAccountExtension = vscode.extensions.getExtension('ms-vscode.azure-account');

        // Typings for azureAccount are here: https://github.com/microsoft/vscode-azure-account/blob/master/src/azure-account.api.d.ts
        this._account = !!azureAccountExtension ? azureAccountExtension.exports : undefined;
    }

    get azureAccount(): any { return this._account; }

    async getSubscriptions(): Promise<AzureSubscription[]> {

        if (!(await this.isSignedIn())) {
            throw new Error(`You need to be signed in to Azure for this. Execute 'Azure: Sign In' command.`);
        }
        
        return this._account.filters;
    }

    // Uses vscode.authentication to get a token with custom scopes
    async getToken(scopes: string[] = ['https://management.core.windows.net/user_impersonation']): Promise<string> {

        const authSession = await this.getAuthSession('microsoft', scopes);
        
        return authSession.accessToken;
    }

    async isSignedIn(): Promise<boolean> {

        return !!this._account && !!(await this._account.waitForFilters());
    }

    async subscriptionsAvailable(): Promise<boolean> {

        return !!this._account && !!(await this._account.waitForFilters()) && (this._account.filters.length > 0);
    }

    async queryGraph(resourceType: string): Promise<any[]>{

        let uri = `${ARM_URL}/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01`;

        let result: any[] = [];
        let skipToken = undefined;

        for (let i = 0; i < MAX_BATCHES; i++) {

            const body: any = {
                query: `resources | where type == "${resourceType.toLowerCase()}"`,
                options: {
                    '$skipToken': skipToken
                }
            };

            const response = await axios.post(uri, body, { headers: { 'Authorization': `Bearer ${await this.getToken()}` } });

            result.push(...response.data?.data ?? []);

            skipToken = response.data['$skipToken'];
            if (!skipToken) {
                break;
            }
        }

        return result;
    }

    async query(path: string, apiVersion: string = DEFAULT_API_VERSION): Promise<any> {

        let uri = `${ARM_URL}${path}?api-version=${apiVersion}`;

        let result: any = undefined;
        for (let i = 0; i < MAX_BATCHES; i++) {

            let response;

            try {

                response = await axios.get(uri, { headers: { 'Authorization': `Bearer ${await this.getToken()}` } });
                
            } catch (err: any) {

                // If this was a nextLink, then just rethrowing
                if (!!result) {
                    throw err;
                }
                
                // Trying to use another api-version, but only if this is the first request
                const newApiVersion = this.tryToGetSupportedApiVersion(err.response);
                if (!newApiVersion) {
                    throw err;
                }

                uri = `${ARM_URL}${path}?api-version=${newApiVersion}`;
                response = await axios.get(uri, { headers: { 'Authorization': `Bearer ${await this.getToken()}` } });
            }

            if (!!result) {
                
                // Expecting result to be an array in this case
                result.push(...response.data?.value);

            } else {

                result = response.data?.value ?? response.data;
            }

            uri = response.data?.nextLink;
            if (!uri) {
                break;
            }
        }

        return result;
    }

    async apply(method: string, resourceId: string, data: any, apiVersion: string): Promise<AxiosResponse>{

        try {

            return await axios({
                method,
                url: `${ARM_URL}${resourceId}?api-version=${apiVersion}`,
                data,
                headers: { 'Authorization': `Bearer ${await this.getToken()}` }
            });
                
        } catch (err: any) {

            // Trying to use another api-version
            const newApiVersion = this.tryToGetSupportedApiVersion(err.response);
            if (!newApiVersion) {
                throw err;
            }

            return await axios({
                method,
                url: `${ARM_URL}${resourceId}?api-version=${apiVersion}`,
                data,
                headers: { 'Authorization': `Bearer ${await this.getToken()}` }
            });
        }
    }

    private readonly _account: any;

    private async getAuthSession(providerId: string, scopes: string[]): Promise<vscode.AuthenticationSession> {

        // Trying to clarify the correct tenantId
        const subscriptions = await this.getSubscriptions();
        if (!!subscriptions?.length) {

            const subscription = subscriptions[0];
            const tenantId = (subscription.session as any)?.tenantId;

            if (!!tenantId) {
                
                scopes.push(`VSCODE_TENANT:${(subscription.session as any).tenantId}`);
            }
        }

        // First trying silent mode
        let authSession = await vscode.authentication.getSession(providerId, scopes, { silent: true });
    
        if (!!authSession) {
            
            return authSession;
        }
    
        // Now asking to authenticate, if needed
        authSession = await vscode.authentication.getSession(providerId, scopes, { createIfNone: true });
    
        return authSession;        
    }

    private tryToGetSupportedApiVersion(response: AxiosResponse): string | undefined {

        if (response?.status !== 400 || response?.data?.error?.code !== 'NoRegisteredProviderFound') {
            return;
        }

        const supportedVersionsMatch = /The supported api-versions are '([^']+)'/i.exec(response?.data?.error?.message);
        if (!supportedVersionsMatch) {
            return;
        }

        const supportedVersions = supportedVersionsMatch[1].split(',');
        if (!supportedVersions.length) {
            return;
        }

        return supportedVersions[supportedVersions.length - 1].trim();
    }
}
