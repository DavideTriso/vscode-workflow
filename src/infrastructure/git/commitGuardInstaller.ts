import { promises as fileSystem } from 'node:fs';
import * as path from 'node:path';
import { WorkflowError } from '../../application/support';
import { GitCommandRunner } from './gitCommandRunner';

const HOOK_MARKER = '# copilot-workflow-guide:managed-hook';

function escapeForRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildPreCommitHook(outputFolder: string): string {
  const folder = escapeForRegularExpression(outputFolder.split(path.sep).join('/').replace(/\/+$/, ''));
  return [
    '#!/bin/sh',
    HOOK_MARKER,
    '# Blocks commits that do not include a workflow file. Bypass intentionally with: git commit --no-verify',
    '',
    'if [ -f "$(git rev-parse --git-path MERGE_HEAD)" ]; then',
    '  exit 0',
    'fi',
    '',
    `if git diff --cached --name-only --diff-filter=AM | grep -q '^${folder}/.*\\.json$'; then`,
    '  exit 0',
    'fi',
    '',
    `echo "Commit bloccato: includi il file di workflow di '${outputFolder}' (Copilot Workflow Guide)." >&2`,
    'exit 1',
    '',
  ].join('\n');
}

export class CommitGuardInstaller {
  private readonly runner: GitCommandRunner;

  constructor(
    private readonly workspaceRoot: string,
    private readonly outputFolder: () => string,
  ) {
    this.runner = new GitCommandRunner(workspaceRoot);
  }

  async install(): Promise<string> {
    const hooksPath = (await this.runner.run(['rev-parse', '--git-path', 'hooks'])).trim();
    const hooksDirectory = path.resolve(this.workspaceRoot, hooksPath);
    const hookPath = path.join(hooksDirectory, 'pre-commit');

    const existing = await this.readIfExists(hookPath);
    if (existing !== undefined && !existing.includes(HOOK_MARKER)) {
      throw new WorkflowError(`Esiste già un hook pre-commit non gestito dall'estensione (${hookPath}): non viene sovrascritto.`);
    }

    await fileSystem.mkdir(hooksDirectory, { recursive: true });
    await fileSystem.writeFile(hookPath, buildPreCommitHook(this.outputFolder()), { encoding: 'utf8', mode: 0o755 });
    await fileSystem.chmod(hookPath, 0o755);
    return hookPath;
  }

  private async readIfExists(filePath: string): Promise<string | undefined> {
    try {
      return await fileSystem.readFile(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }
}
