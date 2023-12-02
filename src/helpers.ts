
export function formatError(err: any): string {

    return `${(err as any).message ?? err}. ${JSON.stringify(err.response?.data)}`;
}
