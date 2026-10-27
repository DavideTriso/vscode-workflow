import { execFile } from 'node:child_process';

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export class GitCommandRunner {
  constructor(private readonly workspaceRoot: string) {}

  run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        'git',
        ['-C', this.workspaceRoot, '-c', 'core.quotepath=false', ...args],
        { maxBuffer: MAX_OUTPUT_BYTES, encoding: 'utf8', windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr.trim() || error.message));
            return;
          }
          resolve(stdout);
        },
      );
    });
  }
}
