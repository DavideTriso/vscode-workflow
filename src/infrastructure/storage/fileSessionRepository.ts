import { promises as fileSystem } from 'node:fs';
import * as path from 'node:path';
import type { SessionRepository, StoredSession } from '../../application/ports';
import type { WorkflowSession } from '../../domain/workflowSession';

export interface FileSessionRepositoryOptions {
  workspaceRoot: string;
  outputFolder: () => string;
  onCorruptedFile: (filePath: string, error: unknown) => void;
}

/** Validates the file and fills the fields that older files (one per chat) do not have. */
function parseWorkflowSession(value: unknown): WorkflowSession | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const candidate = value as Partial<WorkflowSession>;
  const isValid =
    candidate.schemaVersion === 1 &&
    typeof candidate.id === 'string' &&
    typeof candidate.createdAt === 'string' &&
    Array.isArray(candidate.reviews) &&
    Array.isArray(candidate.styleChecks) &&
    typeof candidate.automatedTests === 'object' &&
    typeof candidate.manualTests === 'object' &&
    typeof candidate.finalNotes === 'string';
  if (!isValid) {
    return undefined;
  }
  const session = candidate as WorkflowSession;
  return {
    ...session,
    taskId: typeof candidate.taskId === 'string' ? candidate.taskId : session.id,
    status: candidate.status === 'active' ? 'active' : 'paused',
    chatSessionId: typeof candidate.chatSessionId === 'string' && candidate.chatSessionId !== '' ? candidate.chatSessionId : undefined,
  };
}

export function buildSessionFileName(session: Pick<WorkflowSession, 'id' | 'createdAt'>): string {
  const timestamp = session.createdAt.slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  return `${timestamp}-${session.id}.json`;
}

export class FileSessionRepository implements SessionRepository {
  constructor(private readonly options: FileSessionRepositoryOptions) {}

  async listAll(): Promise<StoredSession[]> {
    const directory = this.outputDirectory();
    let fileNames: string[];
    try {
      fileNames = await fileSystem.readdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    const stored: StoredSession[] = [];
    for (const fileName of fileNames.filter((name) => name.endsWith('.json'))) {
      const filePath = path.join(directory, fileName);
      try {
        const session = parseWorkflowSession(JSON.parse(await fileSystem.readFile(filePath, 'utf8')));
        if (session) {
          stored.push({ session, filePath });
        }
      } catch (error) {
        this.options.onCorruptedFile(filePath, error);
      }
    }
    return stored.sort((a, b) => a.session.createdAt.localeCompare(b.session.createdAt));
  }

  async save(session: WorkflowSession): Promise<StoredSession> {
    const directory = this.outputDirectory();
    await fileSystem.mkdir(directory, { recursive: true });
    const filePath = path.join(directory, buildSessionFileName(session));
    const temporaryPath = `${filePath}.tmp`;
    // Stable LF formatting keeps the committed diffs identical on Windows and macOS.
    await fileSystem.writeFile(temporaryPath, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
    await fileSystem.rename(temporaryPath, filePath);
    return { session, filePath };
  }

  private outputDirectory(): string {
    return path.join(this.options.workspaceRoot, this.options.outputFolder());
  }
}
