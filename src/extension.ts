import * as vscode from 'vscode';
import { registerChat } from './chat';
import { WorkflowController } from './controller';
import { WorkflowPanel } from './panel';

export function activate(context: vscode.ExtensionContext): void {
  const controller = new WorkflowController(context.workspaceState);
  const panel = new WorkflowPanel(context.extensionUri, controller);
  const command = (name: string, operation: () => Promise<unknown>, exclusive = true) => {
    context.subscriptions.push(vscode.commands.registerCommand(`developmentWorkflow.${name}`, async () => {
      try { await (exclusive ? controller.exclusive(operation) : operation()); }
      catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Errore workflow.'); }
    }));
  };
  command('open', async () => vscode.commands.executeCommand('developmentWorkflow.panel.focus'));
  command('new', async () => controller.newSession());
  command('capture', async () => {
    const fromChat = await controller.exclusive(async () => controller.importAnalysis());
    if (fromChat) { await controller.openChat('capture'); }
  }, false);
  command('implement', async () => controller.openChat('implement'), false);
  command('review', async () => controller.openChat('review'), false);
  command('style', async () => controller.openChat('style'), false);
  command('commit', async () => controller.prepareCommit());
  context.subscriptions.push(vscode.commands.registerCommand('developmentWorkflow.handoff', async (root: unknown, id: unknown) => {
    try {
      if (typeof root !== 'string' || typeof id !== 'string') { throw new Error('Sessione non valida.'); }
      await controller.exclusive(async () => controller.handoff(await controller.select(root, id)));
    } catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Errore workflow.'); }
  }));
  context.subscriptions.push(
    controller,
    controller.onDidChange(() => panel.refresh()),
    vscode.window.registerWebviewViewProvider('developmentWorkflow.panel', panel),
    registerChat(controller)
  );
}
