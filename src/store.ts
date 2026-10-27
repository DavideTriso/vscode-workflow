import { mkdir, lstat, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import { join, relative, isAbsolute, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { newSession, RECORD_DIRECTORY, Session } from './session';

export class SessionStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly root: string) {}

  private async directory(): Promise<string> {
    const root = await realpath(this.root);
    const directory = join(root, RECORD_DIRECTORY);
    await mkdir(directory, { recursive: true });
    const stat = await lstat(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() || await realpath(directory) !== directory) {
      throw new Error('La cartella .workflow deve essere una directory reale nel repository.');
    }
    return directory;
  }

  fileName(id: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
      throw new Error('ID sessione non valido.');
    }
    return `${id}.json`;
  }

  async load(id: string): Promise<Session> {
    const path = join(await this.directory(), this.fileName(id));
    if ((await lstat(path)).isSymbolicLink()) { throw new Error('File sessione simbolico non consentito.'); }
    const session = JSON.parse(await readFile(path, 'utf8')) as Session;
    if (session.schemaVersion !== 1 || session.id !== id || !Array.isArray(session.analyses)
      || !Array.isArray(session.reviews) || !session.tests || typeof session.finalNotes !== 'string') {
      throw new Error('File sessione non valido o versione non supportata.');
    }
    return session;
  }

  async create(): Promise<Session> {
    const session = newSession();
    await this.save(session);
    return session;
  }

  save(session: Session): Promise<void> {
    // Serialize writes and capture the value now, not when a queued write starts.
    session.updatedAt = new Date().toISOString();
    const content = JSON.stringify(session, null, 2) + '\n';
    const name = this.fileName(session.id);
    const task = this.queue.then(async () => {
      const directory = await this.directory();
      const temporary = join(directory, `.${randomUUID()}.tmp`);
      try {
        const handle = await open(temporary, 'wx', 0o600);
        try { await handle.writeFile(content, 'utf8'); } finally { await handle.close(); }
        await rename(temporary, join(directory, name));
      } finally {
        await rm(temporary, { force: true });
      }
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
}

export function isInside(root: string, path: string): boolean {
  const part = relative(root, path);
  return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`));
}
