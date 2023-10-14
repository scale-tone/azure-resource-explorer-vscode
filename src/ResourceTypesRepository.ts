import axios from "axios";
import { AzureAccountWrapper } from "./AzureAccountWrapper";

export type ProvidersMap = { [namespace: string]: { resourceType: string, locations: string[], apiVersions: string[], defaultApiVersion?: string, capabilities: string }[] };

export class ResourceTypesRepository {

    constructor(private _account: AzureAccountWrapper) { }
    
    async getProviderMap(): Promise<ProvidersMap> {

        if (!this._map) {

            const response = await axios.get(`https://management.azure.com/providers?api-version=2023-07-01`, { headers: { 'Authorization': `Bearer ${await this._account.getToken()}` } });

            const map = {} as any;
            for (const ns of (response.data?.value ?? [])) {
    
                map[ns.namespace.toLowerCase()] = ns.resourceTypes;
            }
    
            this._map = map;
        }

        return this._map!;
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