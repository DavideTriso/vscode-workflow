import { promises as fileSystem } from 'node:fs';
import * as path from 'node:path';
import type { ChatTranscriptSource, Logger } from '../../application/ports';
import type { ChatTranscript } from '../../domain/chatTranscript';
import { mapChatSession } from './chatSessionMapper';
import { parseChatSessionFile } from './mutationLog';

interface SessionFileInfo {
  fileName: string;
  modifiedAtMs: number;
  size: number;
}

const MAX_CANDIDATES = 3;

/**
 * Reads the Copilot chat sessions that VS Code persists in the workspace storage
 * (`<workspaceStorage>/<hash>/chatSessions`). No public API exposes the chat history,
 * so this adapter is the single place that depends on that on-disk format.
 */
export class FileChatTranscriptSource implements ChatTranscriptSource {
  private lastDiagnostic: string | undefined;

  constructor(
    private readonly chatSessionsDirectory: () => string | undefined,
    private readonly logger?: Logger,
  ) {}

  async readLatest(): Promise<ChatTranscript | undefined> {
    const directory = this.chatSessionsDirectory();
    if (!directory) {
      this.report('No workspace storage available: chat sessions cannot be read.');
      return undefined;
    }
    const files = await this.listSessionFiles(directory);
    for (const file of files.slice(0, MAX_CANDIDATES)) {
      const transcript = await this.tryRead(directory, file);
      if (transcript && transcript.turns.length > 0) {
        return transcript;
      }
    }
    this.report(`No readable chat found in ${directory} (${files.length} session file(s) listed).`);
    return undefined;
  }

  /** Cheap fingerprint used to detect that the chat changed without parsing it. */
  async readSignature(): Promise<string> {
    const directory = this.chatSessionsDirectory();
    if (!directory) {
      return '';
    }
    const newest = (await this.listSessionFiles(directory))[0];
    return newest ? `${newest.fileName}:${newest.modifiedAtMs}:${newest.size}` : '';
  }

  /** Logs each distinct diagnostic once, to avoid flooding the output channel on every poll. */
  private report(message: string): void {
    if (message !== this.lastDiagnostic) {
      this.lastDiagnostic = message;
      this.logger?.info(message);
    }
  }

  private async listSessionFiles(directory: string): Promise<SessionFileInfo[]> {
    let fileNames: string[];
    try {
      fileNames = await fileSystem.readdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    const files = await Promise.all(
      fileNames
        .filter((name) => name.endsWith('.json') || name.endsWith('.jsonl'))
        .map(async (fileName): Promise<SessionFileInfo | undefined> => {
          try {
            const stats = await fileSystem.stat(path.join(directory, fileName));
            return { fileName, modifiedAtMs: stats.mtimeMs, size: stats.size };
          } catch {
            return undefined;
          }
        }),
    );
    return files.filter((file): file is SessionFileInfo => file !== undefined).sort((a, b) => b.modifiedAtMs - a.modifiedAtMs);
  }

  private async tryRead(directory: string, file: SessionFileInfo): Promise<ChatTranscript | undefined> {
    try {
      const content = await fileSystem.readFile(path.join(directory, file.fileName), 'utf8');
      const fallbackSessionId = file.fileName.replace(/\.jsonl?$/, '');
      return mapChatSession(parseChatSessionFile(content, file.fileName), fallbackSessionId);
    } catch (error) {
      // The file may be mid-write: the next poll retries.
      this.logger?.error(`Unable to parse chat session file ${file.fileName}.`, error);
      return undefined;
    }
  }
}
