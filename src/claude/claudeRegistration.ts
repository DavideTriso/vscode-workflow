import * as vscode from 'vscode';
import { access } from 'node:fs/promises';
import { resolveClaudeConfigDir, syncClaudePlugin } from './claudePlugin';

const modeSetting = 'claudeCode.registration';
const syncedVersionKey = 'claudePlugin.syncedVersion';
export const registerClaudeCommand = 'vscode-workflow.registerClaudeCode';

type RegistrationMode = 'ask' | 'enabled' | 'disabled';

/** Registers the Claude Code plugin on install and update, after the user agrees once. */
export function activateClaudeRegistration(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(registerClaudeCommand, async () => {
            await setMode('enabled');
            await runRegistration(context, true);
        }),
    );
    void syncOnActivation(context);
}

async function syncOnActivation(context: vscode.ExtensionContext): Promise<void> {
    const mode = vscode.workspace.getConfiguration('vscode-workflow').get<RegistrationMode>(modeSetting, 'ask');
    if (mode === 'disabled') {
        return;
    }
    if (mode === 'ask') {
        await askToRegister(context);
        return;
    }
    if (context.globalState.get(syncedVersionKey) === syncStamp(context)) {
        return;
    }
    await runRegistration(context, false);
}

async function askToRegister(context: vscode.ExtensionContext): Promise<void> {
    // Only prompt people who actually use Claude Code; the command remains available to everyone else.
    if (!await exists(resolveClaudeConfigDir())) {
        return;
    }
    const registerLabel = 'Register';
    const never = 'Never';
    const choice = await vscode.window.showInformationMessage(
        'Make the Workflow agents and skills available to Claude Code? This adds a local plugin to your Claude Code user settings.',
        registerLabel, never,
    );
    if (choice === never) {
        await setMode('disabled');
    }
    if (choice === registerLabel) {
        await setMode('enabled');
        await runRegistration(context, true);
    }
}

async function runRegistration(context: vscode.ExtensionContext, notify: boolean): Promise<void> {
    const version: string = context.extension.packageJSON.version;
    try {
        await vscode.workspace.fs.createDirectory(context.globalStorageUri);
        await syncClaudePlugin({
            extensionPath: context.extensionPath,
            storagePath: context.globalStorageUri.fsPath,
            version,
        });
        await context.globalState.update(syncedVersionKey, syncStamp(context));
        if (notify) {
            void vscode.window.showInformationMessage('Workflow plugin registered. Restart Claude Code sessions or run /reload-plugins to load it.');
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Could not register the Claude Code plugin: ${message}`);
    }
}

/** Version plus Node path: a VS Code update moves the Node binary the plugin points at. */
function syncStamp(context: vscode.ExtensionContext): string {
    return `${context.extension.packageJSON.version}|${process.execPath}`;
}

function setMode(mode: RegistrationMode): Thenable<void> {
    return vscode.workspace.getConfiguration('vscode-workflow').update(modeSetting, mode, vscode.ConfigurationTarget.Global);
}

async function exists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}
