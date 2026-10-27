import { promises as fileSystem } from 'node:fs';
import * as path from 'node:path';
import type { ChatTranscriptSource } from '../../application/ports';
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
  constructor(private readonly chatSessionsDirectory: () => string | undefined) {}

  async readLatest(): Promise<ChatTranscript | undefined> {
    const directory = this.chatSessionsDirectory();
    if (!directory) {
      return undefined;
    }
    const files = await this.listSessionFiles(directory);
    for (const file of files.slice(0, MAX_CANDIDATES)) {
      const transcript = await this.tryRead(directory, file);
      if (transcript && transcript.turns.length > 0) {
        return transcript;
      }
    }
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
    } catch {
      // The file may be mid-write: the next poll retries.
      return undefined;
    }
  }
}
