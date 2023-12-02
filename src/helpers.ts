
export function formatError(err: any): string {

    return `${(err as any).message ?? err}. ${err.response?.data ? JSON.stringify(err.response.data) : ''}`;
}
