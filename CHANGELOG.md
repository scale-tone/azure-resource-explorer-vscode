# Change Log

## Version 1.6

- Now you can configure specific api-versions to be used for specific resourceIds and/or paths. Provide an array of `{'pathIncludes': '/path/to/resource', 'version': 'api-version-to-use'}` objects via the `azure-resource-explorer-for-vscode.customApiVersions` config setting:

    <img width="599" alt="image" src="https://github.com/user-attachments/assets/0f49364f-ccc9-4731-a93a-985091ab355e" />

  , and the relevant api-version will be used when making queries containing given subpath.
  Thanks [@wyattfry](https://github.com/wyattfry) for this contribution!

## Version 1.5

- Decoupled from (soon deprecated) [Azure Account extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.azure-account).

## Version 1.4

- Implemented filtering by Resource Providers:

  <img width="500px" src="https://github.com/scale-tone/azure-resource-explorer-vscode/assets/5447190/ccd9ea59-d72e-48da-909b-7232cf20b14f"/>

## Version 1.3

- Integrated with [KeeShepherd](https://marketplace.visualstudio.com/items?itemName=kee-shepherd.kee-shepherd-vscode) extension. Now for supported resource types you can quickly copy their secrets into Clipboard, e.g.:

  <img width="300px" src="https://github.com/scale-tone/azure-resource-explorer-vscode/assets/5447190/3dc121a8-fe40-42f5-adc0-4b8f690555ae"/>

## Version 1.2

- Now showing the entire resource hierarchy (not just root resources), e.g.:

  <img width="300px" src="https://github.com/scale-tone/azure-resource-explorer-vscode/assets/5447190/4d64bf91-758f-4663-8c2b-d8db1201eeda" />

- Bicep generation fixes.

## Version 1.1

- Checking whether a .bicep file already exists before overwriting it ([#1](https://github.com/scale-tone/azure-resource-explorer-vscode/issues/1)).

## Version 1.0

- Initial release
