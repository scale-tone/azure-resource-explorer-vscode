import * as vscode from 'vscode';
import { openUrl } from '@microsoft/vscode-azext-utils';

import { ARM_URL, AzureAccountWrapper, DEFAULT_API_VERSION } from './AzureAccountWrapper';
import { ResourceTypesRepository } from './ResourceTypesRepository';
import { ArmFsProvider } from './ArmFsProvider';

export enum ResourceExplorerNodeTypeEnum {
    Providers = 1,
    Subscriptions,
    ProviderNamespace,
    ProviderResourceType,
    Subscription,
    ResourceGroup,
    ResourceGroupResourceType,
    Resource
}

export type ResourceExplorerTreeItem = vscode.TreeItem & {

    nodeType: ResourceExplorerNodeTypeEnum,
    url: string,
    nodeId?: string,
    portalUrl?: string,
    tenantId?: string,
    resources?: any[]
};

// Resource Explorer as a TreeView
export class ResourceExplorerTreeView implements vscode.TreeDataProvider<vscode.TreeItem> {

    constructor(private _account: AzureAccountWrapper, private _resourceTypeRepository: ResourceTypesRepository, private _fsProvider: ArmFsProvider, private _resourcesFolder: string) {}

    protected _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined> = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._resourceTypeRepository.cleanup();
        this._onDidChangeTreeData.fire(undefined);
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

    // Does nothing, actually
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

    async getChildren(parent: ResourceExplorerTreeItem): Promise<ResourceExplorerTreeItem[]> {

        const result: ResourceExplorerTreeItem[] = [];

        try {

            switch (parent?.nodeType) {

                case undefined: {

                    result.push({
                        nodeType: ResourceExplorerNodeTypeEnum.Providers,
                        label: 'Providers',
                        url: `${ARM_URL}/providers?api-version=${DEFAULT_API_VERSION}`,
                        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                    });

                    result.push({
                        nodeType: ResourceExplorerNodeTypeEnum.Subscriptions,
                        label: 'Subscriptions',
                        url: `${ARM_URL}/subscriptions?api-version=${DEFAULT_API_VERSION}`,
                        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                    });

                    break;
                }
                    
                case ResourceExplorerNodeTypeEnum.Providers: {

                    const providerMap = await this._resourceTypeRepository.getProviderMap();

                    for (const ns in providerMap) {
                        
                        result.push({
                            nodeType: ResourceExplorerNodeTypeEnum.ProviderNamespace,
                            label: ns,
                            nodeId: ns,
                            url: `${ARM_URL}/providers/${ns}?api-version=${DEFAULT_API_VERSION}`,
                            resources: providerMap[ns],
                            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                        });
                    }

                    break;
                }
                    
                case ResourceExplorerNodeTypeEnum.ProviderNamespace: {

                    for (const resourceType of parent.resources ?? []) {
                        
                        result.push({
                            nodeType: ResourceExplorerNodeTypeEnum.ProviderResourceType,
                            label: resourceType.resourceType,
                            url: `${ARM_URL}/providers/${parent.nodeId}/${resourceType.resourceType}?api-version=${DEFAULT_API_VERSION}`,
                            collapsibleState: vscode.TreeItemCollapsibleState.None,
                        });
                    }

                    break;
                }

                case ResourceExplorerNodeTypeEnum.Subscriptions: {

                    for (const subscription of await this._account.getSubscriptions()) {

                        result.push({
                            nodeType: ResourceExplorerNodeTypeEnum.Subscription,
                            nodeId: subscription.subscription.subscriptionId,
                            label: subscription.subscription.displayName,
                            url: `${ARM_URL}/subscriptions/${subscription.subscription.subscriptionId}?api-version=${DEFAULT_API_VERSION}`,
                            portalUrl: (subscription.session as any).environment?.portalUrl,
                            tenantId: (subscription.session as any).tenantId,
                            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                        });
                    }

                    break;
                }

                case ResourceExplorerNodeTypeEnum.Subscription: {

                    const resourceGroups = await this._account.query(`/subscriptions/${parent.nodeId}/resourcegroups`);

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

                    const resources = await this._account.query(`${parent.nodeId}/resources`);
                    
                    const resourcesByTypes = {} as any;
                    for (const res of (resources ?? [])) {

                        resourcesByTypes[res.type] ??= [];
                        resourcesByTypes[res.type].push(res);
                    }

                    for (const resType in resourcesByTypes) {

                        const resources = resourcesByTypes[resType];

                        const apiVersion = !resources?.length ? DEFAULT_API_VERSION : await this._resourceTypeRepository.getApiVersion(resources[0].id);

                        result.push({
                            nodeType: ResourceExplorerNodeTypeEnum.ResourceGroupResourceType,
                            nodeId: parent.nodeId,
                            label: `${resType} (${resources.length})`,
                            url: `${ARM_URL}${parent.nodeId}/providers/${resType}?api-version=${apiVersion}`,
                            portalUrl: parent.portalUrl,
                            tenantId: parent.tenantId,
                            resources,
                            collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
                        });
                    }

                    break;
                }

                case ResourceExplorerNodeTypeEnum.ResourceGroupResourceType: {

                    for (const res of parent.resources ?? []) {

                        const apiVersion = await this._resourceTypeRepository.getApiVersion(res.id);

                        const node: ResourceExplorerTreeItem = {
                            nodeType: ResourceExplorerNodeTypeEnum.Resource,
                            contextValue: `${ResourceExplorerNodeTypeEnum[ResourceExplorerNodeTypeEnum.Resource]}`,
                            nodeId: res.id,
                            label: res.name,
                            description: res.location,
                            tooltip: res.kind,
                            url: `${ARM_URL}${encodeURI(res.id)}?api-version=${apiVersion}`,
                            portalUrl: parent.portalUrl,
                            tenantId: parent.tenantId,
                            collapsibleState: vscode.TreeItemCollapsibleState.None
                        };

                        node.command = {
                            title: 'Show as ARM template',
                            command: 'azure-resource-explorer-for-vscode.view-context.showAsArm',
                            arguments: [node]
                        };

                        result.push(node);
                    }

                    break;
                }
            }

        } catch (err) {
            vscode.window.showErrorMessage(`Failed to load the Resource Explorer view. ${(err as any).message ?? err}`);
        }

        return result;
    }

    async applyCurrentJson(item: ResourceExplorerTreeItem) {

        const document = vscode.window.activeTextEditor?.document;
        if (!document) {
            throw new Error('Could not find an open document');
        }

        const json = JSON.parse(document.getText());
 
        await this._fsProvider.applyJson(item.nodeId, json);
    }
}