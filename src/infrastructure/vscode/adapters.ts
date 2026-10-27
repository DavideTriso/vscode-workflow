import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import type { ChatLaunchMode, ChatLauncher, Clock, IdGenerator, Logger, WorkflowSettings } from '../../application/ports';

export class VsCodeChatLauncher implements ChatLauncher {
  async open(prompt: string, mode: ChatLaunchMode): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.chat.open', { query: prompt, mode, isPartialQuery: false });
  }
}

export function readWorkflowSettings(): WorkflowSettings {
  const configuration = vscode.workspace.getConfiguration('copilotWorkflow');
  return {
    isAutoCaptureEnabled: configuration.get<boolean>('autoCaptureAnalysis', true),
    planModeNamePattern: configuration.get<string>('planModeNamePattern', 'plan'),
    maxDiffCharacters: configuration.get<number>('maxDiffCharacters', 80000),
    outputFolder: configuration.get<string>('outputFolder', '.copilot-workflow'),
  };
}

export class OutputChannelLogger implements Logger {
  constructor(private readonly channel: vscode.OutputChannel) {}

  info(message: string): void {
    this.channel.appendLine(message);
  }

  error(message: string, error?: unknown): void {
    const detail = error instanceof Error ? ` ${error.message}` : error === undefined ? '' : ` ${String(error)}`;
    this.channel.appendLine(`[errore] ${message}${detail}`);
  }
}

export const systemClock: Clock = { nowIso: () => new Date().toISOString() };

export const uuidGenerator: IdGenerator = { next: () => randomUUID().slice(0, 8) };
