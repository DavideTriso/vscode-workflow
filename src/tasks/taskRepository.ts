import { execFile } from 'node:child_process';
import { randomInt } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { compareTasksNewestFirst, createOpenTaskSummary } from './taskModel';
import type { CreateTaskInput, TaskSummary } from './taskProtocol';

const execFileAsync = promisify(execFile);

export class TaskRepository {
    async findRepositoryRoot(workspacePath: string): Promise<string | undefined> {
        try {
            const result = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
                cwd: workspacePath,
                encoding: 'utf8',
                windowsHide: true,
            });
            return result.stdout.trim() || undefined;
        } catch {
            return undefined;
        }
    }

    async listOpenTasks(repositoryRoot: string): Promise<TaskSummary[]> {
        const directory = this.getTaskDirectory(repositoryRoot);
        const entries = await this.readTaskEntries(directory);
        const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
        const taskResults = await Promise.all(
            jsonFiles.map(async (entry) => {
                const content = await readFile(path.join(directory, entry.name), 'utf8');
                try {
                    return createOpenTaskSummary(entry.name, JSON.parse(content) as unknown);
                } catch {
                    return undefined;
                }
            }),
        );

        return taskResults
            .filter((task): task is TaskSummary => task !== undefined)
            .sort(compareTasksNewestFirst);
    }

    async createTask(repositoryRoot: string, input: CreateTaskInput, now = new Date()): Promise<string> {
        const directory = this.getTaskDirectory(repositoryRoot);
        await mkdir(directory, { recursive: true });

        const createdOnDateTime = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
        const timestamp = createdOnDateTime.slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
        const task = {
            name: input.name,
            createdOnDateTime,
            projectManagementUrl: input.projectManagementUrl,
            description: input.description,
            status: 0,
            timeTracking: [],
        };
        const content = `${JSON.stringify(task, null, 2)}\n`;

        for (let attempt = 0; attempt < 5; attempt += 1) {
            const taskId = `${timestamp}-${createRandomSuffix()}.json`;
            try {
                await writeFile(path.join(directory, taskId), content, { encoding: 'utf8', flag: 'wx' });
                return taskId;
            } catch (error) {
                if (getErrorCode(error) !== 'EEXIST') {
                    throw error;
                }
            }
        }

        throw new Error('Could not generate a unique task file name.');
    }

    async isTracked(repositoryRoot: string, taskId: string): Promise<boolean> {
        const taskFileName = this.validateTaskId(taskId);
        const relativePath = path.posix.join('history', 'tasks', taskFileName);
        try {
            await execFileAsync('git', ['ls-files', '--error-unmatch', '--', relativePath], {
                cwd: repositoryRoot,
                encoding: 'utf8',
                windowsHide: true,
            });
            return true;
        } catch (error) {
            if (getExitCode(error) === 1) {
                return false;
            }
            throw error;
        }
    }

    async deleteTask(repositoryRoot: string, taskId: string): Promise<void> {
        const taskFileName = this.validateTaskId(taskId);
        await unlink(path.join(this.getTaskDirectory(repositoryRoot), taskFileName));
    }

    private async readTaskEntries(directory: string): Promise<Dirent[]> {
        try {
            return await readdir(directory, { withFileTypes: true });
        } catch (error) {
            if (getErrorCode(error) === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    private getTaskDirectory(repositoryRoot: string): string {
        return path.join(repositoryRoot, 'history', 'tasks');
    }

    private validateTaskId(taskId: string): string {
        if (path.basename(taskId) !== taskId || !taskId.endsWith('.json')) {
            throw new Error('Invalid task file name.');
        }
        return taskId;
    }
}

function getErrorCode(error: unknown): string | number | undefined {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
        return undefined;
    }
    const { code } = error;
    return typeof code === 'string' || typeof code === 'number' ? code : undefined;
}

function getExitCode(error: unknown): number | undefined {
    const code = getErrorCode(error);
    return typeof code === 'number' ? code : undefined;
}

function createRandomSuffix(): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 15 }, () => alphabet.charAt(randomInt(alphabet.length))).join('');
}