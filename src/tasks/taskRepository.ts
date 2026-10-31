import { execFile } from 'node:child_process';
import { randomBytes, randomInt } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { compareTasksNewestFirst, createOpenTaskSummary, createTaskSummary } from './taskModel';
import type { CreateTaskInput, TaskStatus, TaskSummary, TimeTrackingEntry } from './taskProtocol';

const execFileAsync = promisify(execFile);
type GitEmailProvider = (repositoryRoot: string) => Promise<string | undefined>;

export class TaskRepository {
    constructor(private readonly gitEmailProvider: GitEmailProvider = readGitUserEmail) {}

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

    async getTask(repositoryRoot: string, taskId: string): Promise<TaskSummary | undefined> {
        const { taskFileName, originalValue } = await this.readTaskRecord(repositoryRoot, taskId);
        return createTaskSummary(taskFileName, originalValue);
    }

    getGitUserEmail(repositoryRoot: string): Promise<string | undefined> {
        return this.gitEmailProvider(repositoryRoot);
    }

    getTaskFilePath(repositoryRoot: string, taskId: string): string {
        return path.join(this.getTaskDirectory(repositoryRoot), this.validateTaskId(taskId));
    }

    async createTask(repositoryRoot: string, input: CreateTaskInput, now = new Date()): Promise<string> {
        const createdBy = await this.requireGitUserEmail(repositoryRoot);
        const directory = this.getTaskDirectory(repositoryRoot);
        await mkdir(directory, { recursive: true });

        const createdOnDateTime = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
        const timestamp = createdOnDateTime.slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
        const task = {
            name: input.name,
            createdOnDateTime,
            projectManagementUrl: input.projectManagementUrl,
            description: input.description,
            createdBy,
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

    async updateTask(repositoryRoot: string, taskId: string, input: CreateTaskInput): Promise<void> {
        const { taskFileName, taskPath, originalValue, originalTask } = await this.readTaskRecord(repositoryRoot, taskId);
        if (!originalTask || !isRecord(originalValue)) {
            throw new Error('This task is no longer open or has invalid data.');
        }

        const updatedTask = {
            ...originalValue,
            name: input.name,
            projectManagementUrl: input.projectManagementUrl,
            description: input.description,
        };
        await this.writeTaskRecord(taskPath, updatedTask);
    }

    async closeTask(repositoryRoot: string, taskId: string, now = new Date()): Promise<TaskSummary> {
        const { taskFileName, taskPath, originalValue } = await this.readTaskRecord(repositoryRoot, taskId);
        const task = createTaskSummary(taskFileName, originalValue);
        if (!task || !isRecord(originalValue)) {
            throw new Error('Task has invalid data.');
        }
        if (task.status === 2) {
            throw new Error('Task is already done.');
        }

        const timeTracking: unknown[] = Array.isArray(originalValue.timeTracking)
            ? [...originalValue.timeTracking]
            : [];
        let openEntryIndex = -1;
        for (let index = timeTracking.length - 1; index >= 0 && openEntryIndex < 0; index -= 1) {
            const entry = timeTracking[index];
            if (isRecord(entry) && entry.endDateTime === null) {
                openEntryIndex = index;
            }
        }
        if (openEntryIndex >= 0) {
            const openEntry = timeTracking[openEntryIndex];
            if (isRecord(openEntry)) {
                timeTracking[openEntryIndex] = { ...openEntry, endDateTime: toIsoSeconds(now) };
            }
        }

        const updatedTask = {
            ...originalValue,
            status: 2 satisfies TaskStatus,
            timeTracking,
        };
        await this.writeTaskRecord(taskPath, updatedTask);
        const savedTask = createTaskSummary(taskFileName, updatedTask);
        if (!savedTask) {
            throw new Error('Could not read the updated task.');
        }
        return savedTask;
    }

    async toggleTimeTracking(repositoryRoot: string, taskId: string, now = new Date()): Promise<TaskSummary> {
        const { taskFileName, taskPath, originalValue } = await this.readTaskRecord(repositoryRoot, taskId);
        const task = createTaskSummary(taskFileName, originalValue);
        if (!task || !isRecord(originalValue)) {
            throw new Error('Task has invalid data.');
        }

        const entries: unknown[] = Array.isArray(originalValue.timeTracking) ? [...originalValue.timeTracking] : [];
        const lastEntry = entries.at(-1);
        if (isRecord(lastEntry) && lastEntry.endDateTime === null) {
            entries[entries.length - 1] = { ...lastEntry, endDateTime: toIsoSeconds(now) };
        } else {
            const user = await this.requireGitUserEmail(repositoryRoot);
            entries.push({ startDateTime: toIsoSeconds(now), endDateTime: null, user });
        }

        const updatedTask = {
            ...originalValue,
            status: isRecord(lastEntry) && lastEntry.endDateTime === null ? task.status : 1,
            timeTracking: entries,
        };
        await this.writeTaskRecord(taskPath, updatedTask);
        const savedTask = createTaskSummary(taskFileName, updatedTask);
        if (!savedTask) {
            throw new Error('Could not read the updated task.');
        }
        return savedTask;
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

    private async requireGitUserEmail(repositoryRoot: string): Promise<string> {
        const email = await this.gitEmailProvider(repositoryRoot);
        if (!email) {
            throw new Error('Set your Git email with `git config user.email` before creating tasks or starting time tracking.');
        }
        return email;
    }

    private async readTaskRecord(repositoryRoot: string, taskId: string): Promise<{
        taskFileName: string;
        taskPath: string;
        originalValue: unknown;
        originalTask: TaskSummary | undefined;
    }> {
        const taskFileName = this.validateTaskId(taskId);
        const taskPath = this.getTaskFilePath(repositoryRoot, taskFileName);
        const content = await readFile(taskPath, 'utf8');
        const originalValue: unknown = JSON.parse(content);
        const originalTask = createOpenTaskSummary(taskFileName, originalValue);
        return { taskFileName, taskPath, originalValue, originalTask };
    }

    private async writeTaskRecord(taskPath: string, value: Record<string, unknown>): Promise<void> {
        const temporaryPath = `${taskPath}.${randomBytes(8).toString('hex')}.tmp`;
        await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
            encoding: 'utf8',
            flag: 'wx',
        });
        try {
            await rename(temporaryPath, taskPath);
        } catch (error) {
            await unlink(temporaryPath).catch(() => undefined);
            throw error;
        }
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readGitUserEmail(repositoryRoot: string): Promise<string | undefined> {
    let email: string;
    try {
        const result = await execFileAsync('git', ['config', 'user.email'], {
            cwd: repositoryRoot,
            encoding: 'utf8',
            windowsHide: true,
        });
        email = result.stdout.trim();
    } catch (error) {
        if (getExitCode(error) === 1) {
            return undefined;
        }
        throw error;
    }
    if (email === '') {
        return undefined;
    }
    return email;
}

function toIsoSeconds(date: Date): string {
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}