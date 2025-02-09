import { AzureAccountWrapper } from "./AzureAccountWrapper";
import { ExtensionContext } from "vscode"
export type ResourceType = { resourceType: string, locations: string[], apiVersions: string[], defaultApiVersion?: string, capabilities: string };
export type ProvidersMap = { [namespace: string]: ResourceType[] };

export class ResourceTypesRepository {

    constructor(private _account: AzureAccountWrapper, private _context: ExtensionContext) { }

    cleanup() {
        this._map = undefined;
    }
    
    async getProviderMap(): Promise<ProvidersMap> {

        if (!this._map) {

            const providers = await this._account.query('/providers', undefined, this._context);

            const map = {} as any;
            for (const ns of (providers ?? [])) {
    
                map[ns.namespace.toLowerCase()] = ns.resourceTypes;
            }
    
            this._map = map;
        }

        return this._map!;
    }

    async getNamespaces(): Promise<string[]> {

        return Object.keys(await this.getProviderMap());
    }

    async getResources(namespace: string): Promise<ResourceType[]> {

        const map = await this.getProviderMap();

        return map[namespace]?.filter(t => !t.resourceType.includes('/'));
    }

    async getChildResourceTypes(resourceId: string): Promise<string[]> {

        const resourceTypeMatch = /\/providers\/([^\/]+)\//i.exec(resourceId);
        if (!resourceTypeMatch) {
            
            throw new Error(`Incorrect resourceId: ${resourceId}`);
        }

        const map = await this.getProviderMap();
        const resTypes = map[resourceTypeMatch[1].toLowerCase()];

        const path = resourceId.substring(resourceTypeMatch.index + resourceTypeMatch[0].length);
        // In this array even items are subresource types and odd items are subresource names
        const pathParts = path.split('/');

        // Collecting even items
        const resourceTypeParts = pathParts.filter((_, i) => i % 2 === 0);
        const resourceType = resourceTypeParts.join('/');

        return resTypes.
            filter(t => t.resourceType.toLowerCase().startsWith(`${resourceType}/`)).
            map(t => t.resourceType.substring(`${resourceType}/`.length)).
            filter(t => !t.includes('/'))
        ;
    }

    async getApiVersion(resourceId: string): Promise<string>{

        const resourceTypeMatch = /\/providers\/([^\/]+)\/([^\/]+)\//i.exec(resourceId);
        if (!resourceTypeMatch) {
            
            throw new Error(`Incorrect resourceId: ${resourceId}`);
        }

        const map = await this.getProviderMap();
        const resTypes = map[resourceTypeMatch[1].toLowerCase()];

        const resType = resTypes.find(t => t.resourceType.toLowerCase() === resourceTypeMatch[2].toLowerCase());
        if (!resType?.apiVersions) {
            throw new Error(`Failed to find an apiVersion for resource ${resourceId}`);
        }

        return resType.defaultApiVersion ?? resType.apiVersions[0];
    }

    private _map: ProvidersMap | undefined = undefined;
}