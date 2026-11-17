/**
 * Reads the repository folder from what VS Code passes to a Source Control menu command: a folder `Uri`,
 * or a source control object that has a `rootUri`. Returns `undefined` for anything else.
 */
export function repositoryRootFromArgument(argument: unknown): string | undefined {
    const uri = isRecord(argument) && isRecord(argument.rootUri) ? argument.rootUri : argument;
    if (isRecord(uri) && typeof uri.fsPath === 'string' && uri.fsPath.length > 0) {
        return uri.fsPath;
    }
    return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
