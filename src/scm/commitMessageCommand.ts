import * as vscode from 'vscode';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ClaudeCliNotFoundError, claudePathSettingKey, isExecutableFile, resolveClaudeCli } from './claudeCli';
import { defaultMaxDiffChars, generateCommitMessage, NoChangesError, readMaxDiffChars } from './commitMessageGenerator';
import { isAbortError, runProcess } from './processRunner';
import { repositoryRootFromArgument } from './repositoryArgument';

export const generateCommitMessageCommand = 'vscode-workflow.generateCommitMessage';

const gitExtensionId = 'vscode.git';
const claudeCodeExtensionId = 'anthropic.claude-code';

/** The part of the built-in Git extension API that this command uses. */
interface GitRepository {
    rootUri: vscode.Uri;
    inputBox: { value: string };
}

interface GitApi {
    repositories: GitRepository[];
}

export function activateCommitMessage(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(generateCommitMessageCommand, (argument?: unknown) => run(context, argument)),
    );
}

async function run(context: vscode.ExtensionContext, argument: unknown): Promise<void> {
    const repository = await findRepository(argument);
    if (!repository) {
        void vscode.window.showWarningMessage('Open a Git repository to generate a commit message.');
        return;
    }
    if (repository.inputBox.value.trim() && !await confirmReplace()) {
        return;
    }

    try {
        const message = await generateWithProgress(context, repository.rootUri.fsPath);
        if (message !== undefined) {
            repository.inputBox.value = message;
        }
    } catch (error) {
        await reportFailure(error);
    }
}

/** Resolves to the generated message, or `undefined` when the user cancelled. */
async function generateWithProgress(context: vscode.ExtensionContext, repositoryRoot: string): Promise<string | undefined> {
    const settings = vscode.workspace.getConfiguration('vscode-workflow.commitMessage');
    const model = settings.get<string>('model', '').trim();
    const claudePath = await resolveClaudeCli({
        configuredPath: settings.get<string>('claudePath', ''),
        pathVariable: process.env.PATH,
        claudeCodeExtensionPath: vscode.extensions.getExtension(claudeCodeExtensionId)?.extensionPath,
        platform: process.platform,
        isExecutable: isExecutableFile,
    });
    const rules = await readFile(
        path.join(context.extensionPath, 'claude-plugin', 'skills', 'commit-message', 'commit-message-rules.md'),
        'utf8',
    );

    return vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Generating commit message with Claude Code', cancellable: true },
        async (_progress, token) => {
            const abortController = new AbortController();
            token.onCancellationRequested(() => abortController.abort());
            try {
                return await generateCommitMessage({
                    repositoryRoot,
                    claudePath,
                    rules,
                    maxDiffChars: readMaxDiffChars(settings.get<number>('maxDiffChars', defaultMaxDiffChars)),
                    ...(model ? { model } : {}),
                    signal: abortController.signal,
                    runCommand: runProcess,
                });
            } catch (error) {
                if (isAbortError(error)) {
                    return undefined;
                }
                throw error;
            }
        },
    );
}

async function confirmReplace(): Promise<boolean> {
    const replace = 'Replace';
    const choice = await vscode.window.showWarningMessage(
        'The commit message box already has text. Replace it with a generated message?',
        { modal: true },
        replace,
    );
    return choice === replace;
}

async function reportFailure(error: unknown): Promise<void> {
    if (error instanceof NoChangesError) {
        void vscode.window.showInformationMessage(error.message);
        return;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ClaudeCliNotFoundError) {
        const openSettings = 'Open Settings';
        const choice = await vscode.window.showErrorMessage(message, openSettings);
        if (choice === openSettings) {
            await vscode.commands.executeCommand('workbench.action.openSettings', claudePathSettingKey);
        }
        return;
    }
    void vscode.window.showErrorMessage(message);
}

/**
 * Finds the repository whose commit box to fill: the one VS Code passed to the command, else the only open
 * repository, else the one the user picks.
 */
async function findRepository(argument: unknown): Promise<GitRepository | undefined> {
    const repositories = await getGitRepositories();
    const requestedRoot = repositoryRootFromArgument(argument);
    const requested = repositories.find((repository) => repository.rootUri.fsPath === requestedRoot);
    if (requested || repositories.length <= 1) {
        return requested ?? repositories[0];
    }
    const choice = await vscode.window.showQuickPick(
        repositories.map((repository) => ({ label: path.basename(repository.rootUri.fsPath), description: repository.rootUri.fsPath, repository })),
        { placeHolder: 'Select the repository to generate a commit message for' },
    );
    return choice?.repository;
}

async function getGitRepositories(): Promise<GitRepository[]> {
    const extension = vscode.extensions.getExtension<{ getAPI(version: 1): GitApi }>(gitExtensionId);
    if (!extension) {
        return [];
    }
    const exports = await extension.activate();
    return exports.getAPI(1).repositories;
}
