import * as vscode from 'vscode';
import { formatUser, readTeamMembers } from './taskModel';
import { readRepositoryGroups } from './repositoryGroups';
import type { RepositoryGroup, UserIdentity } from './taskProtocol';
import { readGitConfigValue, type UserIdentityProvider } from './taskRepository';

export const userSettingKeys = ['vscode-workflow.user.email', 'vscode-workflow.user.name', 'vscode-workflow.teamMembers'] as const;
export const repositoryGroupsSettingKey = 'vscode-workflow.repositoryGroups';

/** Maximum age in days of tasks offered as related tasks; 0 means no limit. */
export function getRelatedTaskMaxAgeDays(): number {
    const value = vscode.workspace.getConfiguration('vscode-workflow').get<number>('relatedTasks.maxAgeDays', 90);
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

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

export function getConfiguredRepositoryGroups(): RepositoryGroup[] {
    return readRepositoryGroups(vscode.workspace.getConfiguration('vscode-workflow').get<unknown>('repositoryGroups', []));
}
