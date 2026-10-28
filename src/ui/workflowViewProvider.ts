import * as vscode from 'vscode';
import type { WorkflowService } from '../application/workflowService';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from './messages';
import { renderWebviewHtml } from './webviewHtml';

const COMMAND_IDS: Record<Extract<WebviewToExtensionMessage, { type: 'command' }>['command'], string> = {
  captureAnalysis: 'copilotWorkflow.captureAnalysis',
  startReview: 'copilotWorkflow.startReview',
  captureReviewResponse: 'copilotWorkflow.captureReviewResponse',
  startStyleCheck: 'copilotWorkflow.startStyleCheck',
  stageSessionFile: 'copilotWorkflow.stageSessionFile',
  installCommitGuard: 'copilotWorkflow.installCommitGuard',
  openSessionFile: 'copilotWorkflow.openSessionFile',
  openSourceControl: 'workbench.view.scm',
};

export class WorkflowViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'copilotWorkflow.workflowView';

  private view: vscode.WebviewView | undefined;
  private readonly subscription: { dispose(): void };

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly service: WorkflowService,
    private readonly reportError: (error: unknown) => void,
  ) {
    this.subscription = service.onDidChangeState(() => this.postState());
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    webviewView.webview.html = renderWebviewHtml(webviewView.webview, this.extensionUri);
    webviewView.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => void this.handleMessage(message));
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
  }

  dispose(): void {
    this.subscription.dispose();
  }

  private postState(): void {
    const message: ExtensionToWebviewMessage = { type: 'state', state: this.service.getState() };
    void this.view?.webview.postMessage(message);
  }

  private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'ready':
          this.postState();
          break;
        case 'command':
          await vscode.commands.executeCommand(COMMAND_IDS[message.command]);
          break;
        case 'startWorkflow':
          await this.service.startWorkflow(message.taskId);
          break;
        case 'selectWorkflow':
          await this.service.selectWorkflow(message.workflowId);
          break;
        case 'updateTests': {
          const record = { executed: message.executed, notes: message.notes };
          await (message.kind === 'automated' ? this.service.updateAutomatedTests(record) : this.service.updateManualTests(record));
          break;
        }
        case 'updateFinalNotes':
          await this.service.updateFinalNotes(message.finalNotes);
          break;
      }
    } catch (error) {
      this.reportError(error);
    }
  }
}
