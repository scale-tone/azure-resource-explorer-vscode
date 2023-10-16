# Azure Resource Explorer as a VsCode extension

Combined power of [Azure Portal's Resource Explorer](https://portal.azure.com/#view/HubsExtension/ArmExplorerBlade) and [https://resources.azure.com](https://resources.azure.com) in your VsCode.

## How to install

Install it from [VsCode marketplace](https://marketplace.visualstudio.com/items?itemName=az-resource-explorer-vscode.azure-resource-explorer-for-vscode). 

## How to use

Once installed, a new `RESOURCE EXPLORER` view should appear on the `AZURE` tab:

<img src="https://github.com/scale-tone/azure-resource-explorer-vscode/assets/5447190/cb9f99f4-6d89-4ba8-bbfe-8dae70cec4a1" width="400">

It will show a tree of all Azure resources visible to you (so long as you're signed in into Azure), organized by resource providers or by subscriptions/resource groups.

Clicking on a resource node downloads and shows resource's template as JSON.
That ARM template is *editable*. Make changes to it and press `Save` - and you will be prompted to confirm that you want your changes to be applied. Just make sure you know what you're doing.

Alternatively use `Apply JSON from current file to this resource...` command to apply arbitrary JSON to a resource.
E.g. here is how to modify app settings for an Azure App Service instance:

<img src="https://github.com/scale-tone/azure-resource-explorer-vscode/assets/5447190/899581c2-3564-4a7b-843b-d55937bc5c49" width="700">

<img src="https://github.com/scale-tone/azure-resource-explorer-vscode/assets/5447190/44b395af-7914-41be-8a88-d8b9536ed05b" width="700">

<img src="https://github.com/scale-tone/azure-resource-explorer-vscode/assets/5447190/5c9ea5ea-1ea9-4e60-84ed-3a963e0c94fa" width="700">


Also you can open your resource as Bicep (instead of an ARM template):

<img src="https://github.com/scale-tone/azure-resource-explorer-vscode/assets/5447190/b2e33e92-e89b-45cc-8fb2-9e959c5caed7" width="700">

(for that to work you need to have Azure CLI installed)

Last but not least is this `Copy access token to Clipboard` button:

<img src="https://github.com/scale-tone/azure-resource-explorer-vscode/assets/5447190/a68c1ab5-147e-41db-8179-05649f6b20b0" width="500">

Use it to quickly get an ARM-scoped access token and then make your own requests e.g. via Postman.

## How to compile and run

**azure-resource-explorer-vscode** is a typical [VsCode extension](https://code.visualstudio.com/api/get-started/your-first-extension), so to run these sources you need to:
1. Clone this repo.
2. Open the root folder with VsCode.
3. Do `npm install`.
4. Hit F5.

## Contributing

Is very much welcomed.
