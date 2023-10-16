# Azure Resource Explorer as a VsCode extension

Combined power of [Azure Portal's Resource Explorer](https://portal.azure.com/#view/HubsExtension/ArmExplorerBlade) and [https://resources.azure.com](https://resources.azure.com) in your VsCode.

## How to install

Install it from [VsCode marketplace](https://marketplace.visualstudio.com/items?itemName=az-resource-explorer-vscode.azure-resource-explorer-for-vscode). 

## How to use

Once installed, a new `RESOURCE EXPLORER` view should appear on the `AZURE` tab:

<img src="https://github.com/scale-tone/azure-resource-explorer-vscode/assets/5447190/ddacdc75-fdcb-455d-8c69-b733f2206f4f" width="400">

It will show a tree of all Azure resources visible to you (so long as you're signed in into Azure), organized by resource providers or by subscriptions/resource groups.

Clicking on a resource node downloads and shows resource's template as JSON.
That ARM template is *editable*. Make changes to it and press `Save` - and you will be prompted to confirm that you want your changes to be applied. Just make sure you know what you're doing.

Alternatively use `Apply JSON from current file to this resource...` command to apply arbitrary JSON to a resource.
E.g. here is how to modify app settings for an Azure App Service instance:

<img src="https://github.com/scale-tone/azure-resource-explorer-vscode/assets/5447190/6203d8f2-8d40-46fb-a0d3-89aefe556c71" width="700">

<img src="https://github.com/scale-tone/azure-resource-explorer-vscode/assets/5447190/273d6ab1-1324-4417-a86c-64a0e540763e" width="700">

<img src="https://github.com/scale-tone/azure-resource-explorer-vscode/assets/5447190/d3bd6835-09d5-438a-a00b-1afdd1574dd7" width="700">


Also you can open your resource as Bicep (instead of an ARM template):

<img src="https://github.com/scale-tone/azure-resource-explorer-vscode/assets/5447190/df44e9dd-8954-4aef-b07c-35a8820de294" width="700">

(for that to work you need to have Azure CLI installed)

Last but not least is this `Copy access token to Clipboard` button:

<img src="https://github.com/scale-tone/azure-resource-explorer-vscode/assets/5447190/60af6998-b7fa-4a58-a202-8eb22263b0ae" width="500">

Use it to quickly get an ARM-scoped access token and then make your own requests e.g. via Postman.

## How to compile and run

**azure-resource-explorer-vscode** is a typical [VsCode extension](https://code.visualstudio.com/api/get-started/your-first-extension), so to run these sources you need to:
1. Clone this repo.
2. Open the root folder with VsCode.
3. Do `npm install`.
4. Hit F5.

## Contributing

Is very much welcomed.
