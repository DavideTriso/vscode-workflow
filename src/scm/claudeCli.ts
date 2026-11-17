import { access, constants, stat } from 'node:fs/promises';
import path from 'node:path';

export const claudePathSettingKey = 'vscode-workflow.commitMessage.claudePath';

export class ClaudeCliNotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ClaudeCliNotFoundError';
    }
}

export interface ClaudeCliLookup {
    /** Value of the `claudePath` setting; empty when the user did not set one. */
    configuredPath: string;
    /** The `PATH` environment variable. */
    pathVariable: string | undefined;
    /** Install folder of the Claude Code VS Code extension, which ships its own `claude` binary. */
    claudeCodeExtensionPath: string | undefined;
    platform: NodeJS.Platform;
    isExecutable: (filePath: string) => Promise<boolean>;
}

export async function isExecutableFile(filePath: string): Promise<boolean> {
    try {
        const info = await stat(filePath);
        if (!info.isFile()) {
            return false;
        }
        await access(filePath, constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * Finds the `claude` executable: the configured path first, then `PATH`, then the binary bundled with the
 * Claude Code VS Code extension. A configured path that does not work is an error; it never falls back,
 * so a wrong setting is not hidden.
 */
export async function resolveClaudeCli(lookup: ClaudeCliLookup): Promise<string> {
    const configuredPath = lookup.configuredPath.trim();
    if (configuredPath) {
        if (await lookup.isExecutable(configuredPath)) {
            return configuredPath;
        }
        throw new ClaudeCliNotFoundError(
            `The Claude executable "${configuredPath}" does not exist or cannot be run. Fix the "${claudePathSettingKey}" setting.`,
        );
    }

    for (const candidate of [...pathCandidates(lookup), ...bundledCandidates(lookup)]) {
        if (await lookup.isExecutable(candidate)) {
            return candidate;
        }
    }
    throw new ClaudeCliNotFoundError(
        `Could not find the Claude Code CLI on PATH or in the Claude Code extension. Install Claude Code or set "${claudePathSettingKey}" to the full path of the claude executable.`,
    );
}

function executableNames(platform: NodeJS.Platform): string[] {
    return platform === 'win32' ? ['claude.exe'] : ['claude'];
}

function pathCandidates(lookup: ClaudeCliLookup): string[] {
    const directories = (lookup.pathVariable ?? '').split(path.delimiter).filter((directory) => directory.length > 0);
    return directories.flatMap((directory) => executableNames(lookup.platform).map((name) => path.join(directory, name)));
}

function bundledCandidates(lookup: ClaudeCliLookup): string[] {
    const extensionPath = lookup.claudeCodeExtensionPath;
    if (!extensionPath) {
        return [];
    }
    return executableNames(lookup.platform).map((name) => path.join(extensionPath, 'resources', 'native-binary', name));
}
