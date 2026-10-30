import * as vscode from 'vscode';

const emptySidebarProvider: vscode.TreeDataProvider<vscode.TreeItem> = {
    getTreeItem: (item) => item,
    getChildren: () => [],
};

export function activate(context: vscode.ExtensionContext): void {
    console.log('Extension Starter is active.');
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('starter.sidebar', emptySidebarProvider),
    );
}

export function deactivate(): void { }
