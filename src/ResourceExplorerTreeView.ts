import * as vscode from 'vscode';
import { AzureAccountWrapper } from './AzureAccountWrapper';
import axios from 'axios';
import { READONLY_JSON_SCHEME } from './ArmDocumentProvider';
import { ResourceTypesRepository } from './ResourceTypesRepository';
import { ArmFsProvider } from './ArmFsProvider';
import path = require('path');

export enum ResourceExplorerNodeTypeEnum {
    Providers = 1,
    Subscriptions,
    ProviderNamespace,
    ProviderResourceType,
    Subscription,
    SubscriptionProviders,
    SubscriptionResourceGroups,
    ResourceGroup,
    ResourceGroupResourceType,
    ResourceGroupResource
}

export type ResourceExplorerTreeItem = vscode.TreeItem & {

    nodeType: ResourceExplorerNodeTypeEnum,
    nodeId?: string,
    resources?: any[]
};


// Resource Explorer as a TreeView
export class ResourceExplorerTreeView implements vscode.TreeDataProvider<vscode.TreeItem> {

    constructor(private _account: AzureAccountWrapper, private _resourceTypeRepository: ResourceTypesRepository, private _fsProvider: ArmFsProvider, private _resourcesFolder: string) {}

    onDidChangeTreeData?: vscode.Event<void | vscode.TreeItem | vscode.TreeItem[] | null | undefined> | undefined;

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
                        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                    });

                    result.push({
                        nodeType: ResourceExplorerNodeTypeEnum.Subscriptions,
                        label: 'Subscriptions',
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
                            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                        });
                    }

                    break;
                }

                case ResourceExplorerNodeTypeEnum.Subscription: {

                    result.push({
                        nodeType: ResourceExplorerNodeTypeEnum.SubscriptionProviders,
                        nodeId: parent.nodeId,
                        label: 'Providers',
                        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                    });

                    result.push({
                        nodeType: ResourceExplorerNodeTypeEnum.SubscriptionResourceGroups,
                        nodeId: parent.nodeId,
                        label: 'ResourceGroups',
                        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                    });

                    break;
                }

                case ResourceExplorerNodeTypeEnum.SubscriptionResourceGroups: {

                    const uri = `https://management.azure.com/subscriptions/${parent.nodeId}/resourcegroups?api-version=2020-06-01`;
                    const response = await axios.get(uri, { headers: { 'Authorization': `Bearer ${await this._account.getToken()}` } });

                    for (const resGroup of (response.data?.value ?? [])) {

                        const node = {
                            nodeType: ResourceExplorerNodeTypeEnum.ResourceGroup,
                            nodeId: resGroup.id,
                            label: resGroup.name,
                            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                        };

                        // Sorting by name on the fly
                        const index = result.findIndex(n => n.label! > node.label);
                        result.splice(index < 0 ? result.length : index, 0, node);
                    }

                    break;
                }

                case ResourceExplorerNodeTypeEnum.ResourceGroup: {

                    const uri = `https://management.azure.com${parent.nodeId}/resources?api-version=2014-04-01-preview`;
                    const response = await axios.get(uri, { headers: { 'Authorization': `Bearer ${await this._account.getToken()}` } });

                    const resourcesByTypes = {} as any;
                    for (const res of (response.data?.value ?? [])) {

                        resourcesByTypes[res.type] ??= [];
                        resourcesByTypes[res.type].push(res);
                    }

                    for (const resType in resourcesByTypes) {

                        const resources = resourcesByTypes[resType];

                        result.push({
                            nodeType: ResourceExplorerNodeTypeEnum.ResourceGroupResourceType,
                            nodeId: parent.nodeId,
                            label: `${resType} (${resources.length})`,
                            resources,
                            collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
                        });
                    }

                    break;
                }

                case ResourceExplorerNodeTypeEnum.ResourceGroupResourceType: {

                    for (const res of parent.resources ?? []) {

                        const node: ResourceExplorerTreeItem = {
                            nodeType: ResourceExplorerNodeTypeEnum.ResourceGroupResource,
                            contextValue: `${ResourceExplorerNodeTypeEnum[ResourceExplorerNodeTypeEnum.ResourceGroupResource]}`,
                            nodeId: res.id,
                            label: res.name,
                            description: res.location,
                            tooltip: res.kind,
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