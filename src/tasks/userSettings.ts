import * as vscode from 'vscode';
import { formatUser, readTeamMembers } from './taskModel';
import type { UserIdentity } from './taskProtocol';
import { readGitConfigValue, type UserIdentityProvider } from './taskRepository';

export const userSettingKeys = ['vscode-workflow.user.email', 'vscode-workflow.user.name', 'vscode-workflow.teamMembers'] as const;

/**
 * Resolves the current user from the `vscode-workflow.user.*` settings, falling back to
 * `git config user.email` / `user.name` for each value that is not configured.
 */
export const configuredUserIdentityProvider: UserIdentityProvider = async (repositoryRoot) => {
    const configuration = vscode.workspace.getConfiguration('vscode-workflow');
    const configuredEmail = configuration.get<string>('user.email', '').trim();
    const configuredName = configuration.get<string>('user.name', '').trim();
    const [email, name] = await Promise.all([
        configuredEmail || readGitConfigValue(repositoryRoot, 'user.email'),
        configuredName || readGitConfigValue(repositoryRoot, 'user.name'),
    ]);
    if (!email) {
        return undefined;
    }
    return { email, ...(name ? { name } : {}) };
};

export function getConfiguredTeamMembers(): UserIdentity[] {
    return readTeamMembers(vscode.workspace.getConfiguration('vscode-workflow').get<unknown>('teamMembers', []));
}

export function getFormattedTeamMembers(): string[] {
    return getConfiguredTeamMembers().map(formatUser);
}
