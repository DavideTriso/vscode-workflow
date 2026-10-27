import * as path from 'node:path';
import * as vscode from 'vscode';
import { WorkflowError } from './application/support';
import { WorkflowService } from './application/workflowService';
import { ChatChangePoller } from './infrastructure/chat/chatChangePoller';
import { FileChatTranscriptSource } from './infrastructure/chat/fileChatTranscriptSource';
import { CommitGuardInstaller } from './infrastructure/git/commitGuardInstaller';
import { GitCliGateway } from './infrastructure/git/gitCliGateway';
import { FileSessionRepository } from './infrastructure/storage/fileSessionRepository';
import {
  OutputChannelLogger,
  readWorkflowSettings,
  systemClock,
  uuidGenerator,
  VsCodeChatLauncher,
} from './infrastructure/vscode/adapters';
import { WorkflowViewProvider } from './ui/workflowViewProvider';

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Copilot Workflow Guide');
  const logger = new OutputChannelLogger(outputChannel);
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const reportError = (error: unknown): void => {
    if (error instanceof WorkflowError) {
      void vscode.window.showWarningMessage(error.message);
      return;
    }
    logger.error('Operazione non riuscita.', error);
    void vscode.window.showErrorMessage(`Copilot Workflow Guide: ${error instanceof Error ? error.message : String(error)}`);
  };

  // VS Code stores the chat sessions next to the extension storage of the same workspace.
  const chatSessionsDirectory = (): string | undefined =>
    context.storageUri ? path.join(path.dirname(context.storageUri.fsPath), 'chatSessions') : undefined;
  const transcriptSource = new FileChatTranscriptSource(chatSessionsDirectory);

  const service = workspaceRoot
    ? new WorkflowService({
        repository: new FileSessionRepository({
          workspaceRoot,
          outputFolder: () => readWorkflowSettings().outputFolder,
          onCorruptedFile: (filePath, error) => logger.error(`File di workflow non leggibile: ${filePath}.`, error),
        }),
        transcriptSource,
        git: new GitCliGateway(workspaceRoot),
        chatLauncher: new VsCodeChatLauncher(),
        settings: readWorkflowSettings,
        clock: systemClock,
        idGenerator: uuidGenerator,
        logger,
      })
    : undefined;

  if (!service || !workspaceRoot) {
    context.subscriptions.push(outputChannel);
    registerUnavailableCommands(context);
    return;
  }

  const commitGuardInstaller = new CommitGuardInstaller(workspaceRoot, () => readWorkflowSettings().outputFolder);
  const viewProvider = new WorkflowViewProvider(context.extensionUri, service, reportError);
  const poller = new ChatChangePoller(transcriptSource, () => void service.refresh().catch(reportError));

  const registerCommand = (command: string, handler: () => Promise<void>): void => {
    context.subscriptions.push(
      vscode.commands.registerCommand(command, async () => {
        try {
          await handler();
        } catch (error) {
          reportError(error);
        }
      }),
    );
  };

  registerCommand('copilotWorkflow.captureAnalysis', async () => {
    const { usedFallback } = await service.captureAnalysis();
    void vscode.window.showInformationMessage(
      usedFallback
        ? 'Catturata l\'ultima risposta della chat: nessun turno in modalità Plan riconosciuto.'
        : 'Requisiti e piano catturati.',
    );
  });
  registerCommand('copilotWorkflow.startReview', () => service.startReview());
  registerCommand('copilotWorkflow.captureReviewResponse', async () => {
    await service.captureLastResponseAsReview();
    void vscode.window.showInformationMessage('Review catturata.');
  });
  registerCommand('copilotWorkflow.startStyleCheck', () => service.startStyleCheck());
  registerCommand('copilotWorkflow.stageSessionFile', async () => {
    await service.stageSessionFile();
    void vscode.window.showInformationMessage('File di workflow aggiunto allo stage.');
  });
  registerCommand('copilotWorkflow.installCommitGuard', async () => {
    const hookPath = await commitGuardInstaller.install();
    void vscode.window.showInformationMessage(`Guardia pre-commit installata: ${hookPath}`);
  });
  registerCommand('copilotWorkflow.openSessionFile', async () => {
    const filePath = service.getSessionFilePath();
    if (!filePath) {
      throw new WorkflowError('Il file di workflow non è ancora stato creato.');
    }
    await vscode.window.showTextDocument(vscode.Uri.file(filePath));
  });

  context.subscriptions.push(
    outputChannel,
    viewProvider,
    vscode.window.registerWebviewViewProvider(WorkflowViewProvider.viewType, viewProvider),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('copilotWorkflow')) {
        void service.refresh().catch(reportError);
      }
    }),
    { dispose: () => poller.stop() },
  );

  poller.start();
  void service.refresh().catch(reportError);
}

function registerUnavailableCommands(context: vscode.ExtensionContext): void {
  const commands = [
    'captureAnalysis',
    'startReview',
    'captureReviewResponse',
    'startStyleCheck',
    'stageSessionFile',
    'installCommitGuard',
    'openSessionFile',
  ];
  for (const command of commands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`copilotWorkflow.${command}`, () =>
        vscode.window.showWarningMessage('Copilot Workflow Guide richiede una cartella di lavoro aperta.'),
      ),
    );
  }
}

export function deactivate(): void {
  // Disposables are registered in context.subscriptions.
}
