import * as vscode from 'vscode';
import { ResourceExplorerTreeView } from './ResourceExplorerTreeView';
import { AzureAccountWrapper } from './AzureAccountWrapper';
import { ResourceTypesRepository } from './ResourceTypesRepository';
import { ARM_SCHEME, ArmFsProvider } from './ArmFsProvider';

export function activate(context: vscode.ExtensionContext) {

    const logChannel = vscode.window.createOutputChannel('Azure Resource Explorer');

    const log = (s: string, withEof: boolean, withTimestamp: boolean) => {
        try {
            const timestamp = !!withTimestamp ? `${new Date().toISOString()} ` : '';

            if (!!withEof) {
                logChannel.appendLine(timestamp + s);
            } else {
                logChannel.append(timestamp + s);
            }

        } catch (err) {
            // Output channels are unreliable during shutdown, so need to wrap them with this try-catch
        }
    };

    // Chaining all incoming commands, to make sure they never interfere with each other
    let commandChain = Promise.resolve();
    let doAndShowError = async (todo: () => Promise<void>, errorMessage: string) => {

        commandChain = commandChain.then(

            () => todo().catch(err => {

                vscode.window.showErrorMessage(`${errorMessage}. ${err.message ?? err}`);
                log(`${errorMessage}. ${err.message ?? err} ${JSON.stringify(err.response?.data)}`, true, true);
            }
        ));

        return commandChain;
    };

    const azureAccount = new AzureAccountWrapper();

    const resourceTypeRepository = new ResourceTypesRepository(azureAccount);

    const fsProvider = new ArmFsProvider(azureAccount, resourceTypeRepository);

    const treeView = new ResourceExplorerTreeView(azureAccount, resourceTypeRepository, fsProvider, context.asAbsolutePath('resources'), log);

    context.subscriptions.push(

        logChannel,

        vscode.workspace.registerFileSystemProvider(ARM_SCHEME, fsProvider),

        vscode.window.registerTreeDataProvider('azure-resource-explorer-for-vscode-tree-view', treeView),

        vscode.commands.registerCommand('azure-resource-explorer-for-vscode.view-context.showAsArm', (item) => doAndShowError(() => fsProvider.show(item.nodeId), 'Failed to show the code')),
        vscode.commands.registerCommand('azure-resource-explorer-for-vscode.view-context.showAsBicep', (item) => doAndShowError(() => treeView.openAsBicep(item), 'Failed to show the code')),
        vscode.commands.registerCommand('azure-resource-explorer-for-vscode.view-context.applyCurrentJson', (item) => doAndShowError(() => treeView.applyCurrentJson(item), 'Failed to apply current JSON')),
        vscode.commands.registerCommand('azure-resource-explorer-for-vscode.view-context.copyUrl', (item) => doAndShowError(() => treeView.copyUrl(item), 'Failed to copy URL')),
        vscode.commands.registerCommand('azure-resource-explorer-for-vscode.view-context.copyResourceId', (item) => doAndShowError(() => treeView.copyResourceId(item), 'Failed to copy ResourceId')),
        vscode.commands.registerCommand('azure-resource-explorer-for-vscode.view-context.openInPortal', (item) => doAndShowError(() => treeView.openInPortal(item), 'Failed to open in portal')),

        vscode.commands.registerCommand('azure-resource-explorer-for-vscode.view-context.refresh', () => doAndShowError(async () => treeView.refresh(), 'TreeView refresh failed')),
        vscode.commands.registerCommand('azure-resource-explorer-for-vscode.view-context.copyToken', () => doAndShowError(() => treeView.copyToken(), 'Failed to copy access token')),
    );
}

// This method is called when your extension is deactivated
export function deactivate() { }
