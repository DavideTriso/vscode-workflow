import * as path from 'node:path';
import type { ChangeSet, GitGateway } from '../../application/ports';
import type { SessionFileState } from '../../domain/workflowProgress';
import { GitCommandRunner } from './gitCommandRunner';

const TRUNCATION_NOTICE = '\n[... diff troncato ...]';

function toRepositoryPath(workspaceRoot: string, absolutePath: string): string {
  return path.relative(workspaceRoot, absolutePath).split(path.sep).join('/');
}

export class GitCliGateway implements GitGateway {
  private readonly runner: GitCommandRunner;

  constructor(private readonly workspaceRoot: string) {
    this.runner = new GitCommandRunner(workspaceRoot);
  }

  async readChangeSet(maxDiffCharacters: number, excludedPath: string): Promise<ChangeSet> {
    const exclusion = `:(exclude)${excludedPath.split(path.sep).join('/')}`;
    const diff = await this.readDiff(exclusion);
    const untrackedOutput = await this.runner.run(['ls-files', '--others', '--exclude-standard', '--', '.', exclusion]);
    const isTruncated = diff.length > maxDiffCharacters;
    return {
      diff: isTruncated ? `${diff.slice(0, maxDiffCharacters)}${TRUNCATION_NOTICE}` : diff,
      untrackedFiles: untrackedOutput.split('\n').filter((line) => line.trim() !== ''),
      isTruncated,
    };
  }

  async readFileState(filePath: string): Promise<SessionFileState> {
    const repositoryPath = toRepositoryPath(this.workspaceRoot, filePath);
    const status = await this.runner.run(['status', '--porcelain=v1', '-z', '--', repositoryPath]);
    if (status.length >= 2) {
      const indexStatus = status[0];
      const worktreeStatus = status[1];
      if (indexStatus === '?' && worktreeStatus === '?') {
        return 'untracked';
      }
      return worktreeStatus !== ' ' ? 'modified' : 'staged';
    }
    try {
      await this.runner.run(['ls-files', '--error-unmatch', '--', repositoryPath]);
      return 'committed';
    } catch {
      return 'unknown';
    }
  }

  async stage(filePath: string): Promise<void> {
    await this.runner.run(['add', '--', toRepositoryPath(this.workspaceRoot, filePath)]);
  }

  private async readDiff(exclusion: string): Promise<string> {
    try {
      return await this.runner.run(['diff', 'HEAD', '--no-color', '--', '.', exclusion]);
    } catch {
      // Repository without any commit yet: HEAD does not exist.
      const staged = await this.runner.run(['diff', '--cached', '--no-color', '--', '.', exclusion]);
      const unstaged = await this.runner.run(['diff', '--no-color', '--', '.', exclusion]);
      return `${staged}${unstaged}`;
    }
  }
}
