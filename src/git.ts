import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { Snapshot } from './session';
import { isInside } from './store';

const execute = promisify(execFile);
const MAX_BYTES = 1_000_000;
const pathspec = ['.', ':(exclude).workflow'];

export class GitRepository {
  constructor(readonly root: string) {}

  async run(args: string[]): Promise<string> {
    const result = await execute('git', ['--no-pager', ...args], {
      cwd: this.root, encoding: 'utf8', maxBuffer: MAX_BYTES, timeout: 30_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, windowsHide: true
    });
    return result.stdout;
  }

  async snapshot(): Promise<Snapshot> {
    let head: string;
    try { head = (await this.run(['rev-parse', '--verify', 'HEAD'])).trim(); }
    catch {
      if ((await this.run(['rev-parse', '--is-inside-work-tree'])).trim() !== 'true') {
        throw new Error('Apri un repository Git.');
      }
      head = 'unborn';
    }
    const status = await this.run(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...pathspec]);
    const diffArgs = ['diff', '--no-ext-diff', '--no-textconv', '--binary'];
    const diff = head === 'unborn'
      ? await this.run([...diffArgs, '--cached', '--', ...pathspec])
        + await this.run([...diffArgs, '--', ...pathspec])
      : await this.run([...diffArgs, 'HEAD', '--', ...pathspec]);
    const untracked = (await this.run(['ls-files', '--others', '--exclude-standard', '-z', '--', ...pathspec]))
      .split('\0').filter(Boolean);
    let content = diff;
    const root = await realpath(this.root);
    for (const name of untracked) {
      const path = join(root, name);
      if (!isInside(root, path) || (await lstat(path)).isSymbolicLink() || !isInside(root, await realpath(path))) {
        throw new Error(`File esterno o simbolico non analizzabile: ${name}`);
      }
      if ((await lstat(path)).size > MAX_BYTES) { throw new Error(`File troppo grande per la review: ${name}`); }
      const bytes = await readFile(path);
      if (bytes.includes(0)) { throw new Error(`File binario non analizzabile: ${name}`); }
      content += `\n--- untracked: ${JSON.stringify(name)} ---\n${bytes.toString('utf8')}\n`;
      if (Buffer.byteLength(content) > MAX_BYTES) { throw new Error('Diff troppo grande: riduci il perimetro della review.'); }
    }
    if (Buffer.byteLength(content) > MAX_BYTES) { throw new Error('Diff troppo grande: riduci il perimetro della review.'); }
    return { head, status, diff: content, untracked, capturedAt: new Date().toISOString() };
  }
}
