import * as vscode from 'vscode';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as util from 'util';
import * as path from 'path';
import * as crypto from 'crypto';
import { openUrl } from '@microsoft/vscode-azext-utils';

const execAsync = util.promisify(cp.exec);

import { ARM_URL, AzureAccountWrapper, DEFAULT_API_VERSION } from './AzureAccountWrapper';
import { ResourceTypesRepository } from './ResourceTypesRepository';
import { ArmFsProvider } from './ArmFsProvider';
import { formatError } from './helpers';

export enum ResourceExplorerNodeTypeEnum {
    SignInToAzure = 0,
    Providers = 1,
    Subscriptions,
    ProviderNamespace,
    ProviderResourceType,
    Subscription,
    ResourceGroup,
    ResourceGroupResourceType,
    Resource,
    ResourceWithSecrets,
    SubResourceType
};

export type ResourceExplorerTreeItem = vscode.TreeItem & {

    nodeType: ResourceExplorerNodeTypeEnum,
    url?: string,
    nodeId?: string,
    portalUrl?: string,
    tenantId?: string,
    apiVersion?: string,
    resources?: any[]
};

export const SETTING_NAMES = {
    ProviderFilter: 'AzureResourceExplorer-ProviderFilter',
};

// Resource Explorer as a TreeView
export class ResourceExplorerTreeView implements vscode.TreeDataProvider<vscode.TreeItem> {

    constructor(
        private _context: vscode.ExtensionContext,
        private _account: AzureAccountWrapper,
        private _resourceTypeRepository: ResourceTypesRepository,
        private _fsProvider: ArmFsProvider,
        private _resourcesFolder: string,
        private _log: (s: string, withEof: boolean, withTimestamp: boolean) => void) { }

    protected _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined> = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._resourceTypeRepository.cleanup();
        this._onDidChangeTreeData.fire(undefined);
    }

    async applyFilter() {

        const namespaces = await this._resourceTypeRepository.getNamespaces();
        let selectedNamespaces = this._context.globalState.get(SETTING_NAMES.ProviderFilter) as string[];

        const userChoice = await vscode.window.showQuickPick(
            namespaces.map(ns => {
                return {
                    label: ns,
                    picked: (!(selectedNamespaces?.length)) || selectedNamespaces.includes(ns)
                };
            }),
            {
                canPickMany: true,
                title: 'Select providers to be shown'
            });

        if (!userChoice) {
            return;
        }

        selectedNamespaces = userChoice.map(i => i.label);
        if (selectedNamespaces.length === namespaces.length) {
            selectedNamespaces = [];
        }

        this._context.globalState.update(SETTING_NAMES.ProviderFilter, selectedNamespaces);

        this._onDidChangeTreeData.fire(undefined);
    }

    async copySecret(node: ResourceExplorerTreeItem): Promise<void>{

        if (!node?.nodeId) {
            throw new Error(`ResourceId is empty`);
        }

        const keeShepherdExtension = vscode.extensions.getExtension('kee-shepherd.kee-shepherd-vscode');

        if (!keeShepherdExtension) {

            const userResponse = await vscode.window.showInformationMessage(`For this to work you need to have the [KeeShepherd](https://marketplace.visualstudio.com/items?itemName=kee-shepherd.kee-shepherd-vscode) extension installed.`, 'Install');

            if (userResponse === 'Install') {
                
                await vscode.commands.executeCommand(`extension.open`, `kee-shepherd.kee-shepherd-vscode`);
            }

            return;
        }

        await keeShepherdExtension.exports.copySecretToClipboard(node.nodeId);
    }

    async copyToken(): Promise<void>{

        vscode.env.clipboard.writeText(await this._account.getToken());

        vscode.window.showInformationMessage(`Access token was copied to Clipboard`);
    }

    async copyUrl(node: ResourceExplorerTreeItem): Promise<void>{

        if (!node?.url) {
            throw new Error(`Resource URL is empty`);
        }

        vscode.env.clipboard.writeText(node.url);

        vscode.window.showInformationMessage(`Resource URL was copied to Clipboard`);
    }

    async copyResourceId(node: ResourceExplorerTreeItem): Promise<void>{

        if (!node?.nodeId) {
            throw new Error(`ResourceId is empty`);
        }

        vscode.env.clipboard.writeText(node.nodeId);

        vscode.window.showInformationMessage(`ResourceId was copied to Clipboard`);
    }

    async openInPortal(node: ResourceExplorerTreeItem): Promise<void>{

        if (!node?.portalUrl || !node?.tenantId || !node?.nodeId) {
            throw new Error(`Invalid resource`);
        }

        const portalUrl = `${node.portalUrl}/#@${node.tenantId}/resource${node.nodeId}`;

        await openUrl(portalUrl);
    }

    async openAsBicep(node: ResourceExplorerTreeItem): Promise<void>{

        const resourceId = node?.nodeId;
        if (!resourceId) {
            throw new Error(`ResourceId is empty`);
        }

        const curPath = vscode.workspace?.workspaceFolders?.length ? vscode.workspace?.workspaceFolders[0].uri.fsPath : '';
        if (!curPath) {
            throw new Error(`For this to work you need to have a folder or project opened`);
        }

        const tempFileName = crypto.randomBytes(20).toString('hex');
        const jsonFilePath = path.join(curPath, `${tempFileName}.json`);
        const tempBicepFilePath = path.join(curPath, `${tempFileName}.bicep`);

        const bicepFileName = (node.label as string).replace(/\//g, '-');
        let bicepFilePath: string | undefined = path.join(curPath, `${bicepFileName}.bicep`);

        if (fs.existsSync(bicepFilePath)) {
            
            bicepFilePath = await vscode.window.showInputBox({ value: bicepFilePath, title: `The file ${path.basename(bicepFilePath)} already exists in the current folder. Provide a different file name or just confirm that you want to overwrite the existing one.` });

            if (!bicepFilePath) {
                return;
            }
        }

        const progressOptions = {
            location: vscode.ProgressLocation.Notification,
            title: `GET ${resourceId}`
        };

        await vscode.window.withProgress(progressOptions, async (progress, token) => {

            const apiVersion = await this._resourceTypeRepository.getApiVersion(resourceId);
            const data = await this._account.query(encodeURI(resourceId), apiVersion, this._context);

            data.apiVersion = apiVersion;
            delete data['id'];
            delete data['systemData'];

            const json = {
                '$schema': 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
                resources: [
                    data
                ]
            };

            await fs.promises.writeFile(jsonFilePath, JSON.stringify(json, null, 3));

            try {

                await execAsync(`az bicep decompile --file "${jsonFilePath}"`);

            } catch (err) {

                // Bicep decompile can produce errors, but still create the resulting file. In that case still showing it.
                if (fs.existsSync(tempBicepFilePath)) {

                    this._log(`az bicep decompile produced errors. ${formatError(err)}`, true, true);

                } else {
                    // otherwise rethrowing
                    throw err;
                }

            } finally {

                await fs.promises.rm(jsonFilePath, { force: true });
            }

            await fs.promises.rename(tempBicepFilePath, bicepFilePath!);

            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(bicepFilePath!));
            await vscode.window.showTextDocument(doc, { preview: false });
    });
    }

    // Does nothing, actually
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

    async getChildren(parent: ResourceExplorerTreeItem): Promise<ResourceExplorerTreeItem[]> {

        const result: ResourceExplorerTreeItem[] = [];

        try {

            switch (parent?.nodeType) {

                case undefined: {

                    if (!(await this._account.isSignedIn())) {

                        result.push({
                            nodeType: ResourceExplorerNodeTypeEnum.SignInToAzure,
                            label: 'Sign in to Azure...',
                            command: {
                                title: 'Sign in to Azure...',
                                command: 'azure-resource-explorer-for-vscode.signInToAzure',
                                arguments: []
                            }
                        });
                            
                    } else {

                        const selectedNamespaces = this._context.globalState.get(SETTING_NAMES.ProviderFilter) as string[];

                        result.push({
                            nodeType: ResourceExplorerNodeTypeEnum.Providers,
                            label: 'Providers',
                            contextValue: `${ResourceExplorerNodeTypeEnum[ResourceExplorerNodeTypeEnum.Providers]}`,
                            description: (selectedNamespaces?.length) ? '(filtered)' : undefined,
                            url: `${ARM_URL}/providers?api-version=${DEFAULT_API_VERSION}`,
                            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                        });
    
                        result.push({
                            nodeType: ResourceExplorerNodeTypeEnum.Subscriptions,
                            label: 'Subscriptions',
                            url: `${ARM_URL}/subscriptions?api-version=${DEFAULT_API_VERSION}`,
                            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                        });
                    }

                    break;
                }
                
                case ResourceExplorerNodeTypeEnum.Providers: {

                    const namespaces = await this._resourceTypeRepository.getNamespaces();
                    const selectedNamespaces = this._context.globalState.get(SETTING_NAMES.ProviderFilter) as string[];

                    for (const ns of namespaces.filter(ns => (!(selectedNamespaces?.length)) || selectedNamespaces.includes(ns))) {

                        const node = {
                            nodeType: ResourceExplorerNodeTypeEnum.ProviderNamespace,
                            label: ns,
                            nodeId: ns,
                            url: `${ARM_URL}/providers/${ns}?api-version=${DEFAULT_API_VERSION}`,
                            resources: await this._resourceTypeRepository.getResources(ns),
                            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                        };

                        // Sorting by name on the fly
                        const index = result.findIndex(n => n.label! > node.label);
                        result.splice(index < 0 ? result.length : index, 0, node);
                    }

                    break;
                }
                    
                case ResourceExplorerNodeTypeEnum.ProviderNamespace: {

                    for (const resourceType of parent.resources ?? []) {

                        const node = {
                            nodeType: ResourceExplorerNodeTypeEnum.ProviderResourceType,
                            label: resourceType.resourceType,
                            nodeId: `${parent.nodeId}/${resourceType.resourceType}`,
                            url: `${ARM_URL}/providers/${parent.nodeId}?api-version=${DEFAULT_API_VERSION}`,
                            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                        };

                        // Sorting by name on the fly
                        const index = result.findIndex(n => n.label! > node.label);
                        result.splice(index < 0 ? result.length : index, 0, node);
                    }

                    break;
                }

                case ResourceExplorerNodeTypeEnum.ProviderResourceType: {

                    const resources = await this._account.queryGraph(parent.nodeId!);

                    for (const res of resources) {
                        
                        const apiVersion = await this._resourceTypeRepository.getApiVersion(res.id);

                        const nodeType = this.areResourceSecretsSupported(res.id) ? ResourceExplorerNodeTypeEnum.ResourceWithSecrets :  ResourceExplorerNodeTypeEnum.Resource;

                        const node: ResourceExplorerTreeItem = {
                            nodeType,
                            contextValue: `${ResourceExplorerNodeTypeEnum[nodeType]}`,
                            nodeId: res.id,
                            label: res.name,
                            description: res.location,
                            tooltip: res.kind,
                            url: `${ARM_URL}${encodeURI(res.id)}?api-version=${apiVersion}`,
                            portalUrl: 'https://portal.azure.com',
                            tenantId: res.tenantId,
                            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
                        };

                        node.command = {
                            title: 'Show as ARM template',
                            command: 'azure-resource-explorer-for-vscode.view-context.showAsArm',
                            arguments: [node]
                        };

                        // Sorting by name on the fly
                        const index = result.findIndex(n => n.label! > node.label!);
                        result.splice(index < 0 ? result.length : index, 0, node);
                    }

                    break;
                }
                    
                case ResourceExplorerNodeTypeEnum.Subscriptions: {

                    for (const subscription of await this._account.getSubscriptions()) {

                        result.push({
                            nodeType: ResourceExplorerNodeTypeEnum.Subscription,
                            nodeId: subscription.subscriptionId,
                            label: subscription.name,
                            url: `${ARM_URL}/subscriptions/${subscription.subscriptionId}?api-version=${DEFAULT_API_VERSION}`,
                            portalUrl: subscription.environment?.portalUrl,
                            tenantId: subscription.tenantId,
                            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                        });
                    }

                    break;
                }

                case ResourceExplorerNodeTypeEnum.Subscription: {

                    const resourceGroups = await this._account.query(`/subscriptions/${parent.nodeId}/resourcegroups`, undefined, this._context);

                    for (const resGroup of (resourceGroups ?? [])) {

                        const node = {
                            nodeType: ResourceExplorerNodeTypeEnum.ResourceGroup,
                            nodeId: resGroup.id,
                            label: resGroup.name,
                            url: `${ARM_URL}${resGroup.id}?api-version=${DEFAULT_API_VERSION}`,
                            portalUrl: parent.portalUrl,
                            tenantId: parent.tenantId,
                            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                        };

                        // Sorting by name on the fly
                        const index = result.findIndex(n => n.label! > node.label);
                        result.splice(index < 0 ? result.length : index, 0, node);
                    }

                    break;
                }

                case ResourceExplorerNodeTypeEnum.ResourceGroup: {

                    const resources = await this._account.query(`${parent.nodeId}/resources`, undefined, this._context);
                    
                    const resourcesByTypes = {} as any;
                    for (const res of (resources ?? [])) {

                        resourcesByTypes[res.type] ??= [];
                        resourcesByTypes[res.type].push(res);
                    }

                    for (const resType in resourcesByTypes) {

                        const resources = resourcesByTypes[resType];

                        const apiVersion = !resources?.length ? DEFAULT_API_VERSION : await this._resourceTypeRepository.getApiVersion(resources[0].id);

                        const node = {
                            nodeType: ResourceExplorerNodeTypeEnum.ResourceGroupResourceType,
                            nodeId: parent.nodeId,
                            label: `${resType} (${resources.length})`,
                            url: `${ARM_URL}${parent.nodeId}/providers/${resType}?api-version=${apiVersion}`,
                            portalUrl: parent.portalUrl,
                            tenantId: parent.tenantId,
                            resources,
                            collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
                        };
                        
                        // Sorting by name on the fly
                        const index = result.findIndex(n => n.label! > node.label!);
                        result.splice(index < 0 ? result.length : index, 0, node);
                    }

                    break;
                }

                case ResourceExplorerNodeTypeEnum.ResourceGroupResourceType: {

                    for (const res of parent.resources ?? []) {

                        const apiVersion = await this._resourceTypeRepository.getApiVersion(res.id);

                        const nodeType = this.areResourceSecretsSupported(res.id) ? ResourceExplorerNodeTypeEnum.ResourceWithSecrets :  ResourceExplorerNodeTypeEnum.Resource;
                        
                        const node: ResourceExplorerTreeItem = {
                            nodeType,
                            contextValue: `${ResourceExplorerNodeTypeEnum[nodeType]}`,
                            nodeId: res.id,
                            label: res.name,
                            description: res.location,
                            tooltip: res.kind,
                            url: `${ARM_URL}${encodeURI(res.id)}?api-version=${apiVersion}`,
                            portalUrl: parent.portalUrl,
                            tenantId: parent.tenantId,
                            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
                        };

                        node.command = {
                            title: 'Show as ARM template',
                            command: 'azure-resource-explorer-for-vscode.view-context.showAsArm',
                            arguments: [node]
                        };

                        // Sorting by name on the fly
                        const index = result.findIndex(n => n.label! > node.label!);
                        result.splice(index < 0 ? result.length : index, 0, node);
                    }

                    break;
                }
                
                case ResourceExplorerNodeTypeEnum.Resource:
                case ResourceExplorerNodeTypeEnum.ResourceWithSecrets: {

                    const childResourceTypes = await this._resourceTypeRepository.getChildResourceTypes(parent.nodeId!);

                    for (const childResourceType of childResourceTypes) {

                        const apiVersion = await this._resourceTypeRepository.getApiVersion(parent.nodeId!);
                        
                        const node = {
                            nodeType: ResourceExplorerNodeTypeEnum.SubResourceType,
                            nodeId: `${parent.nodeId}/${childResourceType}`,
                            label: childResourceType,
                            url: `${ARM_URL}${encodeURI(parent.nodeId!)}/${childResourceType}?api-version=${apiVersion}`,
                            apiVersion,
                            portalUrl: parent.portalUrl,
                            tenantId: parent.tenantId,
                            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                        };
                        
                        // Sorting by name on the fly
                        const index = result.findIndex(n => n.label! > node.label!);
                        result.splice(index < 0 ? result.length : index, 0, node);
                    }

                    break;
                }
                    
                case ResourceExplorerNodeTypeEnum.SubResourceType: {

                    try {

                        const resources = await this._account.query(parent.nodeId!, parent.apiVersion, this._context);

                        for (const res of resources) {
                        
                            const apiVersion = await this._resourceTypeRepository.getApiVersion(res.id);
    
                            const nodeType = this.areResourceSecretsSupported(res.id) ? ResourceExplorerNodeTypeEnum.ResourceWithSecrets :  ResourceExplorerNodeTypeEnum.Resource;
                            
                            const node: ResourceExplorerTreeItem = {
                                nodeType,
                                contextValue: `${ResourceExplorerNodeTypeEnum[nodeType]}`,
                                nodeId: res.id,
                                label: res.name,
                                description: res.location,
                                tooltip: res.kind,
                                url: `${ARM_URL}${encodeURI(res.id)}?api-version=${apiVersion}`,
                                portalUrl: parent.portalUrl,
                                tenantId: parent.tenantId,
                                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
                            };
    
                            node.command = {
                                title: 'Show as ARM template',
                                command: 'azure-resource-explorer-for-vscode.view-context.showAsArm',
                                arguments: [node]
                            };
    
                            // Sorting by name on the fly
                            const index = result.findIndex(n => n.label! > node.label!);
                            result.splice(index < 0 ? result.length : index, 0, node);
                        }
                            
                    } catch (err) {

                        this._log(`Failed to load subresources. ${formatError(err)}`, true, true);
                    }

                    break;
                }
            }

        } catch (err) {
            vscode.window.showErrorMessage(`Failed to load the Resource Explorer view. ${formatError(err)}`);
        }

        return result;
    }

    async applyCurrentJson(item: ResourceExplorerTreeItem) {

        const document = vscode.window.activeTextEditor?.document;
        if (!document) {
            throw new Error('Could not find an open document');
        }

        await this._fsProvider.applyJson(item.nodeId, document.getText());
    }

    private readonly _resourceTypesWithSupportedSecretsRegexes = [
        new RegExp('/providers/microsoft.insights/components/([^/]+)$', 'i'),
        new RegExp('/providers/microsoft.cognitiveservices/accounts/([^/]+)$', 'i'),
        new RegExp('/providers/microsoft.maps/accounts/([^/]+)$', 'i'),
        new RegExp('/providers/microsoft.cache/redis/([^/]+)$', 'i'),
        new RegExp('/providers/microsoft.search/searchservices/([^/]+)$', 'i'),
        new RegExp('/providers/microsoft.signalrservice/signalr/([^/]+)$', 'i'),
        new RegExp('/providers/microsoft.documentdb/databaseaccounts/([^/]+)$', 'i'),
        new RegExp('/providers/microsoft.eventgrid/topics/([^/]+)$', 'i'),
        new RegExp('/providers/microsoft.eventhub/namespaces/([^/]+)$', 'i'),
        new RegExp('/providers/microsoft.keyvault/vaults/([^/]+)/(keys|secrets)/([^/]+)$', 'i'),
        new RegExp('/providers/microsoft.servicebus/namespaces/([^/]+)$', 'i'),
        new RegExp('/providers/microsoft.storage/storageaccounts/([^/]+)$', 'i')
    ];
    
    private areResourceSecretsSupported(resourceId: string): boolean {

        for (const regex of this._resourceTypesWithSupportedSecretsRegexes) {
            
            if (regex.test(resourceId)) {
                return true;
            }
        }

        return false;
    }
}