import { execFile } from 'node:child_process';
import { randomBytes, randomInt } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { compareTasksNewestFirst, createOpenTaskSummary, createTaskSummary } from './taskModel';
import { parseImplementationTodo, renderImplementationTodoMarkdown, serializeImplementationTodo, summarizeImplementationTodo } from './implementationTodo';
import { outputAgents, type AgentOutputGroup, type CreateTaskInput, type ImplementationTodoDocument, type ImplementationTodoGroup, type ImplementationTodoGroupOrder, type ImplementationTodoItem, type ImplementationTodoItemDraft, type ImplementationTodoSource, type TaskStatus, type TaskSummary, type TimeTrackingEntry } from './taskProtocol';

const execFileAsync = promisify(execFile);
type GitEmailProvider = (repositoryRoot: string) => Promise<string | undefined>;

export interface CurrentAgentTask {
    taskId: string;
    taskName: string;
    taskFile: string;
    startedAtDateTime: string;
}

interface AgentTaskMarkerFile {
    path: string;
    context: CurrentAgentTask;
}

export class TaskRepository {
    private readonly todoWriteLocks = new Map<string, Promise<void>>();

    constructor(private readonly gitEmailProvider: GitEmailProvider = readGitUserEmail) { }

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

    async getActiveAgentTask(repositoryRoot: string): Promise<CurrentAgentTask> {
        const markers = await this.listAgentTaskMarkers(repositoryRoot);
        if (markers.length !== 1) {
            throw new Error(markers.length === 0
                ? 'Start a task timer before using implementation TODO tools.'
                : 'More than one task is active. Resolve the active task marker before continuing.');
        }
        return markers[0]!.context;
    }

    async readImplementationTodo(repositoryRoot: string, taskId: string): Promise<ImplementationTodoDocument> {
        const filePath = await this.getImplementationTodoPath(repositoryRoot, taskId);
        try {
            return parseImplementationTodo(await readFile(filePath, 'utf8'));
        } catch (error) {
            if (getErrorCode(error) === 'ENOENT') {
                return createEmptyImplementationTodo();
            }
            throw error;
        }
    }

    async listAgentOutputs(repositoryRoot: string, taskId: string): Promise<AgentOutputGroup[]> {
        const directory = path.join(this.getAgentHistoryDirectory(repositoryRoot), this.validateTaskId(taskId));
        const entries = await this.readTaskEntries(directory);
        return Promise.all(outputAgents.map(async (agent) => {
            const fileEntries = entries.filter((entry) => entry.isFile() && matchesAgentOutput(agent.id, entry.name));
            if (agent.id === 'implement') {
                const entry = fileEntries[0];
                if (!entry) {
                    return { id: agent.id, name: agent.name, files: [] };
                }
                try {
                    const filePath = await this.getAgentOutputPath(repositoryRoot, taskId, entry.name);
                    const content = await readFile(filePath, 'utf8');
                    const todo = parseImplementationTodo(content);
                    return {
                        id: agent.id,
                        name: agent.name,
                        files: [{ fileName: entry.name, summary: summarizeImplementationTodo(todo.groups) }],
                        todoGroups: todo.groups,
                    };
                } catch (error) {
                    if (getErrorCode(error) === 'ENOENT') {
                        return { id: agent.id, name: agent.name, files: [] };
                    }
                    return {
                        id: agent.id,
                        name: agent.name,
                        files: [{ fileName: entry.name, summary: 'The TODO list could not be loaded.' }],
                        error: error instanceof Error ? error.message : String(error),
                    };
                }
            }
            const files = await Promise.all(fileEntries.map(async (entry) => {
                try {
                    const filePath = await this.getAgentOutputPath(repositoryRoot, taskId, entry.name);
                    const [content, metadata] = await Promise.all([readFile(filePath, 'utf8'), stat(filePath)]);
                    return { fileName: entry.name, summary: extractOutputSummary(content), modified: metadata.mtimeMs };
                } catch (error) {
                    if (getErrorCode(error) === 'ENOENT') {
                        return undefined;
                    }
                    throw error;
                }
            }));
            return {
                id: agent.id,
                name: agent.name,
                files: files.filter((file) => file !== undefined)
                    .sort((first, second) => second.modified - first.modified || second.fileName.localeCompare(first.fileName))
                    .map(({ fileName, summary }) => ({ fileName, summary })),
            };
        }));
    }

    async getImplementationTodoMarkdown(repositoryRoot: string, taskId: string): Promise<string> {
        const todo = await this.readImplementationTodo(repositoryRoot, taskId);
        return renderImplementationTodoMarkdown(todo);
    }

    async getImplementationTodoItemMarkdown(repositoryRoot: string, taskId: string, itemId: string): Promise<string> {
        const todo = await this.readImplementationTodo(repositoryRoot, taskId);
        const item = findTodoItem(todo.groups, itemId);
        const groupName = findTodoGroupName(todo.groups, itemId);
        return renderImplementationTodoMarkdown({
            ...todo,
            summary: summarizeImplementationTodo([{ name: groupName, items: [item] }]),
            groups: [{ name: groupName, items: [item] }],
        });
    }

    async setTodoStatus(repositoryRoot: string, taskId: string, itemId: string, done: boolean, now = new Date()): Promise<void> {
        await this.updateImplementationTodoItem(repositoryRoot, taskId, itemId, undefined, {
            done,
        }, 'user', false, now);
    }

    async addImplementationTodoItem(
        repositoryRoot: string,
        taskId: string,
        groupName: string,
        draft: ImplementationTodoItemDraft,
        actor: 'agent' | 'user',
        now = new Date(),
    ): Promise<ImplementationTodoItem> {
        validateTodoGroupName(groupName);
        const id = createTodoId(draft.title);
        const item: ImplementationTodoItem = {
            ...draft,
            sourceRef: actor === 'user' ? `user:${id}` : draft.sourceRef,
            id,
            createdBy: actor,
            updatedBy: actor,
            updatedAt: toIsoSeconds(now),
        };
        await this.mutateImplementationTodo(repositoryRoot, taskId, (todo) => {
            const groups = appendTodoItem(todo.groups, groupName, item);
            return withUpdatedTodo(todo, groups);
        });
        return item;
    }

    async updateImplementationTodoItem(
        repositoryRoot: string,
        taskId: string,
        itemId: string,
        groupName: string | undefined,
        changes: Partial<ImplementationTodoItemDraft>,
        actor: 'agent' | 'user',
        allowStatusReconciliation = false,
        now = new Date(),
    ): Promise<ImplementationTodoItem> {
        if (groupName !== undefined) {
            validateTodoGroupName(groupName);
        }
        let updatedItem: ImplementationTodoItem | undefined;
        await this.mutateImplementationTodo(repositoryRoot, taskId, (todo) => {
            const current = findTodoItem(todo.groups, itemId);
            ensureTodoItemEditable(current, changes, actor, allowStatusReconciliation);
            const next: ImplementationTodoItem = {
                ...current,
                ...changes,
                id: current.id,
                createdBy: current.createdBy,
                updatedBy: actor,
                updatedAt: toIsoSeconds(now),
            };
            updatedItem = next;
            return withUpdatedTodo(todo, moveOrUpdateTodoItem(todo.groups, current.id, groupName, next));
        });
        return updatedItem!;
    }

    async removeImplementationTodoItem(
        repositoryRoot: string,
        taskId: string,
        itemId: string,
        actor: 'agent' | 'user',
    ): Promise<void> {
        await this.mutateImplementationTodo(repositoryRoot, taskId, (todo) => {
            const item = findTodoItem(todo.groups, itemId);
            if (actor === 'agent' && item.createdBy === 'user') {
                throw new Error('Agents cannot remove user-created TODO items.');
            }
            const groups = todo.groups.map((group) => ({ ...group, items: group.items.filter((candidate) => candidate.id !== itemId) }));
            return withUpdatedTodo(todo, groups);
        });
    }

    async reorderImplementationTodos(
        repositoryRoot: string,
        taskId: string,
        requestedGroups: ImplementationTodoGroupOrder[],
        actor: 'agent' | 'user',
    ): Promise<void> {
        await this.mutateImplementationTodo(repositoryRoot, taskId, (todo) => {
            const groups = reorderTodoGroups(todo.groups, requestedGroups, actor);
            return withUpdatedTodo(todo, groups);
        });
    }

    async syncReviewTodos(
        repositoryRoot: string,
        taskId: string,
        source: 'logic-review' | 'code-readability',
        groupName: string,
        drafts: ImplementationTodoItemDraft[],
        now = new Date(),
    ): Promise<ImplementationTodoDocument> {
        validateTodoGroupName(groupName);
        await this.mutateImplementationTodo(repositoryRoot, taskId, (todo) => {
            const groups = syncReviewGroup(todo.groups, source, groupName, drafts, now);
            return withUpdatedTodo(todo, groups);
        });
        return this.readImplementationTodo(repositoryRoot, taskId);
    }

    async updateImplementationTodoPlan(
        repositoryRoot: string,
        taskId: string,
        plan: string,
        planSyncedAt = new Date(),
    ): Promise<void> {
        await this.mutateImplementationTodo(repositoryRoot, taskId, (todo) => ({
            ...todo,
            plan,
            planSyncedAt: toIsoSeconds(planSyncedAt),
        }));
    }

    async syncImplementationPlanTodos(
        repositoryRoot: string,
        taskId: string,
        plan: string,
        plannedGroups: Array<{ name: string; items: ImplementationTodoItemDraft[] }>,
        now = new Date(),
    ): Promise<ImplementationTodoDocument> {
        if (plan.trim() === '') {
            throw new Error('The selected plan path cannot be empty.');
        }
        await this.mutateImplementationTodo(repositoryRoot, taskId, (todo) => {
            const existingAgentItems = todo.groups.flatMap((group) => group.items)
                .filter((item) => item.createdBy === 'agent' && item.source !== 'user-note');
            const existingBySource = new Map(existingAgentItems.map((item) => [`${item.source}:${item.sourceRef}`, item]));
            const seenSourceReferences = new Set<string>();
            const planItems = plannedGroups.map((group) => {
                validateTodoGroupName(group.name);
                return {
                    name: group.name,
                    items: group.items.map((draft) => {
                        if (draft.source === 'user-note' || draft.sourceRef.trim() === '') {
                            throw new Error('Plan synchronization requires agent-owned, source-referenced items.');
                        }
                        const sourceKey = `${draft.source}:${draft.sourceRef}`;
                        if (seenSourceReferences.has(sourceKey)) {
                            throw new Error(`Duplicate TODO source reference '${draft.sourceRef}'.`);
                        }
                        seenSourceReferences.add(sourceKey);
                        const existing = existingBySource.get(sourceKey);
                        return {
                            ...draft,
                            id: existing?.id ?? createTodoId(draft.title),
                            createdBy: 'agent' as const,
                            updatedBy: 'agent' as const,
                            updatedAt: toIsoSeconds(now),
                        };
                    }),
                };
            });
            const retainedAgentNotes = todo.groups.map((group) => ({
                name: group.name,
                items: group.items.filter((item) => item.createdBy === 'agent' && item.source === 'user-note'),
            })).filter((group) => group.items.length > 0);
            const retainedUserItems = todo.groups.map((group) => ({
                name: group.name,
                items: group.items.filter((item) => item.createdBy === 'user'),
            })).filter((group) => group.items.length > 0);
            let groups = mergeRetainedTodoGroups(planItems, retainedAgentNotes);
            groups = mergeRetainedTodoGroups(groups, retainedUserItems);
            return {
                ...todo,
                plan,
                planSyncedAt: toIsoSeconds(now),
                groups,
                summary: summarizeImplementationTodo(groups),
            };
        });
        return this.readImplementationTodo(repositoryRoot, taskId);
    }

    async getAgentOutputPath(repositoryRoot: string, taskId: string, fileName: string): Promise<string> {
        const validTaskId = this.validateTaskId(taskId);
        if (path.basename(fileName) !== fileName || !outputAgents.some((agent) => matchesAgentOutput(agent.id, fileName))) {
            throw new Error('Invalid agent output file name.');
        }
        const root = await realpath(repositoryRoot);
        const expectedPath = path.join(root, '.history', 'agents', validTaskId, fileName);
        const resolvedPath = await realpath(expectedPath);
        if (resolvedPath !== expectedPath) {
            throw new Error('Agent output must be a regular file in its task folder.');
        }
        if (!(await stat(resolvedPath)).isFile()) {
            throw new Error('Agent output is not a file.');
        }
        return resolvedPath;
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

    async stopTimeTracking(repositoryRoot: string, taskId: string, now = new Date()): Promise<TaskSummary | undefined> {
        const { taskFileName, taskPath, originalValue } = await this.readTaskRecord(repositoryRoot, taskId);
        const task = createTaskSummary(taskFileName, originalValue);
        if (!task || !isRecord(originalValue)) {
            throw new Error('Task has invalid data.');
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
        if (openEntryIndex < 0) {
            return undefined;
        }

        const openEntry = timeTracking[openEntryIndex];
        if (!isRecord(openEntry)) {
            return undefined;
        }
        timeTracking[openEntryIndex] = { ...openEntry, endDateTime: toIsoSeconds(now) };

        const updatedTask = { ...originalValue, timeTracking };
        await this.writeTaskRecord(taskPath, updatedTask);
        return createTaskSummary(taskFileName, updatedTask);
    }

    async stopOtherTimeTracking(
        repositoryRoot: string,
        exceptTaskId: string,
        now = new Date(),
    ): Promise<TaskSummary[]> {
        const tasks = await this.listOpenTasks(repositoryRoot);
        const activeTasks = tasks.filter((task) =>
            task.id !== exceptTaskId && task.timeTracking.at(-1)?.endDateTime === null,
        );
        const stoppedTasks = await Promise.all(
            activeTasks.map((task) => this.stopTimeTracking(repositoryRoot, task.id, now)),
        );
        return stoppedTasks.filter((task): task is TaskSummary => task !== undefined);
    }

    async startAgentTask(repositoryRoot: string, task: TaskSummary, now = new Date()): Promise<void> {
        await this.stopOtherTimeTracking(repositoryRoot, task.id, now);
        await this.clearAgentTaskMarkers(repositoryRoot);

        const historyDirectory = this.getAgentHistoryDirectory(repositoryRoot);
        const taskDirectory = path.join(historyDirectory, path.basename(task.id));
        await mkdir(taskDirectory, { recursive: true });
        const context: CurrentAgentTask = {
            taskId: task.id,
            taskName: task.name,
            taskFile: path.posix.join('.history', 'tasks', task.id),
            startedAtDateTime: toIsoSeconds(now),
        };
        await writeFile(path.join(taskDirectory, '.current'), `${JSON.stringify(context, null, 2)}\n`, {
            encoding: 'utf8',
            mode: 0o600,
        });
    }

    async stopAgentTask(repositoryRoot: string, taskId: string, now = new Date()): Promise<void> {
        await this.stopTimeTracking(repositoryRoot, taskId, now);
        await this.clearAgentTaskMarkers(repositoryRoot, taskId);
    }

    async clearAgentTaskMarkers(repositoryRoot: string, taskId?: string): Promise<void> {
        const markers = await this.listAgentTaskMarkers(repositoryRoot);
        const targetMarkers = markers.filter((marker) => taskId === undefined || marker.context.taskId === taskId);
        await Promise.all(targetMarkers.map((marker) => unlink(marker.path)));
    }

    async isTracked(repositoryRoot: string, taskId: string): Promise<boolean> {
        const taskFileName = this.validateTaskId(taskId);
        const relativePath = path.posix.join('.history', 'tasks', taskFileName);
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

    private async getImplementationTodoPath(repositoryRoot: string, taskId: string, createDirectory = false): Promise<string> {
        const validTaskId = this.validateTaskId(taskId);
        const root = await realpath(repositoryRoot);
        const historyDirectory = path.join(root, '.history');
        const agentDirectory = path.join(historyDirectory, 'agents');
        const taskDirectory = path.join(agentDirectory, validTaskId);
        if (createDirectory) {
            await mkdir(historyDirectory, { recursive: true });
        }
        const historyRealPath = await realpathIfPresent(historyDirectory);
        if (!historyRealPath) {
            return path.join(taskDirectory, 'implementation-todo.json');
        }
        if (historyRealPath !== historyDirectory) {
            throw new Error('Task history directory must not be a symbolic link.');
        }
        if (createDirectory) {
            await mkdir(agentDirectory, { recursive: true });
        }
        const agentRealPath = await realpathIfPresent(agentDirectory);
        if (!agentRealPath) {
            return path.join(taskDirectory, 'implementation-todo.json');
        }
        if (agentRealPath !== agentDirectory) {
            throw new Error('Agent history directory must not be a symbolic link.');
        }
        if (createDirectory) {
            await mkdir(taskDirectory, { recursive: true });
        }
        const taskRealPath = await realpathIfPresent(taskDirectory);
        if (!taskRealPath) {
            return path.join(taskDirectory, 'implementation-todo.json');
        }
        if (taskRealPath !== taskDirectory) {
            throw new Error('Agent task folder must not be a symbolic link.');
        }
        const filePath = path.join(taskDirectory, 'implementation-todo.json');
        const fileRealPath = await realpathIfPresent(filePath);
        if (fileRealPath && fileRealPath !== filePath) {
            throw new Error('Implementation TODO path must not be a symbolic link.');
        }
        return filePath;
    }

    private async mutateImplementationTodo(
        repositoryRoot: string,
        taskId: string,
        update: (todo: ImplementationTodoDocument) => ImplementationTodoDocument,
    ): Promise<void> {
        const filePath = await this.getImplementationTodoPath(repositoryRoot, taskId, true);
        await this.withTodoWriteLock(filePath, async () => {
            const current = await this.readImplementationTodo(repositoryRoot, taskId);
            const updated = parseImplementationTodo(serializeImplementationTodo(update(current)));
            await this.writeTaskRecord(filePath, updated);
        });
    }

    private async withTodoWriteLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
        const previous = this.todoWriteLocks.get(filePath) ?? Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>((resolve) => {
            release = resolve;
        });
        const queued = previous.then(() => current);
        this.todoWriteLocks.set(filePath, queued);
        await previous;
        try {
            return await operation();
        } finally {
            release();
            if (this.todoWriteLocks.get(filePath) === queued) {
                this.todoWriteLocks.delete(filePath);
            }
        }
    }

    private getTaskDirectory(repositoryRoot: string): string {
        return path.join(repositoryRoot, '.history', 'tasks');
    }

    private getAgentHistoryDirectory(repositoryRoot: string): string {
        return path.join(repositoryRoot, '.history', 'agents');
    }

    private async listAgentTaskMarkers(repositoryRoot: string): Promise<AgentTaskMarkerFile[]> {
        const directory = this.getAgentHistoryDirectory(repositoryRoot);
        const entries = await this.readTaskEntries(directory);
        const taskDirectories = entries.filter((entry) => entry.isDirectory());
        const markerResults = await Promise.all(taskDirectories.map(async (entry) => {
            const markerPath = path.join(directory, entry.name, '.current');
            let content: string;
            try {
                content = await readFile(markerPath, 'utf8');
            } catch (error) {
                if (getErrorCode(error) === 'ENOENT') {
                    return undefined;
                }
                throw error;
            }

            const value: unknown = JSON.parse(content);
            if (!isCurrentAgentTask(value)) {
                throw new Error(`Invalid active task marker: ${markerPath}`);
            }
            return { path: markerPath, context: value };
        }));
        return markerResults.filter((marker): marker is AgentTaskMarkerFile => marker !== undefined);
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

    private async writeTaskRecord(taskPath: string, value: object): Promise<void> {
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

async function realpathIfPresent(filePath: string): Promise<string | undefined> {
    try {
        return await realpath(filePath);
    } catch (error) {
        if (getErrorCode(error) === 'ENOENT') {
            return undefined;
        }
        throw error;
    }
}

function matchesAgentOutput(agentId: AgentOutputGroup['id'], fileName: string): boolean {
    const agent = outputAgents.find((candidate) => candidate.id === agentId);
    return agent?.fileName === fileName;
}

function extractOutputSummary(content: string): string {
    const section = /^## Summary[ \t]*\r?\n([\s\S]*?)(?=^#{1,2}[ \t]+|(?![\s\S]))/m.exec(content)?.[1];
    const text = (section ?? content).trim();
    return text.length > 600 ? `${text.slice(0, 597)}...` : text;
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

function isCurrentAgentTask(value: unknown): value is CurrentAgentTask {
    return isRecord(value) &&
        typeof value.taskId === 'string' &&
        typeof value.taskName === 'string' &&
        typeof value.taskFile === 'string' &&
        typeof value.startedAtDateTime === 'string';
}

function createEmptyImplementationTodo(now = new Date()): ImplementationTodoDocument {
    return {
        version: 1,
        summary: summarizeImplementationTodo([]),
        plan: 'implementation-plan.md',
        planSyncedAt: toIsoSeconds(now),
        groups: [],
    };
}

function createTodoId(title: string): string {
    const slug = title.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    return `${slug || 'todo'}-${createRandomSuffix().toLowerCase()}`;
}

function validateTodoGroupName(groupName: string): void {
    if (groupName.trim() === '' || groupName.length > 60) {
        throw new Error('TODO group names must contain 1 to 60 characters.');
    }
}

function findTodoItem(groups: ImplementationTodoGroup[], itemId: string): ImplementationTodoItem {
    const item = groups.flatMap((group) => group.items).find((candidate) => candidate.id === itemId);
    if (!item) {
        throw new Error(`Implementation TODO item '${itemId}' could not be found.`);
    }
    return item;
}

function findTodoGroupName(groups: ImplementationTodoGroup[], itemId: string): string {
    const group = groups.find((candidate) => candidate.items.some((item) => item.id === itemId));
    if (!group) {
        throw new Error(`Implementation TODO item '${itemId}' could not be found.`);
    }
    return group.name;
}

function ensureTodoItemEditable(
    current: ImplementationTodoItem,
    changes: Partial<ImplementationTodoItemDraft>,
    actor: 'agent' | 'user',
    allowStatusReconciliation: boolean,
): void {
    if (actor === 'agent' && current.createdBy === 'user') {
        throw new Error('Agents cannot edit user-created TODO items.');
    }
    if (actor === 'agent' && current.updatedBy === 'user' && changes.done !== undefined &&
        changes.done !== current.done && !allowStatusReconciliation) {
        throw new Error('Agents cannot change a user-set TODO status outside plan reconciliation.');
    }
}

function appendTodoItem(
    groups: ImplementationTodoGroup[],
    groupName: string,
    item: ImplementationTodoItem,
): ImplementationTodoGroup[] {
    const existingIndex = groups.findIndex((group) => group.name === groupName);
    if (existingIndex < 0) {
        return [...groups, { name: groupName, items: [item] }];
    }
    return groups.map((group, index) => index === existingIndex ? { ...group, items: [...group.items, item] } : group);
}

function mergeRetainedTodoGroups(
    primaryGroups: ImplementationTodoGroup[],
    retainedGroups: ImplementationTodoGroup[],
): ImplementationTodoGroup[] {
    const merged = primaryGroups.map((group) => ({ ...group, items: [...group.items] }));
    for (const retainedGroup of retainedGroups) {
        const target = merged.find((group) => group.name === retainedGroup.name);
        if (!target) {
            merged.push({ name: retainedGroup.name, items: [...retainedGroup.items] });
        }
        if (target) {
            for (const item of retainedGroup.items) {
                if (!target.items.some((candidate) => candidate.id === item.id)) {
                    target.items.push(item);
                }
            }
        }
    }
    return merged;
}

function withUpdatedTodo(todo: ImplementationTodoDocument, groups: ImplementationTodoGroup[]): ImplementationTodoDocument {
    return { ...todo, groups, summary: summarizeImplementationTodo(groups) };
}

function moveOrUpdateTodoItem(
    groups: ImplementationTodoGroup[],
    itemId: string,
    targetGroupName: string | undefined,
    updatedItem: ImplementationTodoItem,
): ImplementationTodoGroup[] {
    const currentGroupName = findTodoGroupName(groups, itemId);
    const destination = targetGroupName ?? currentGroupName;
    validateTodoGroupName(destination);
    if (destination === currentGroupName) {
        return groups.map((group) => group.name === currentGroupName
            ? { ...group, items: group.items.map((item) => item.id === itemId ? updatedItem : item) }
            : group);
    }
    const withoutItem = groups.map((group) => ({
        ...group,
        items: group.items.filter((item) => item.id !== itemId),
    }));
    return appendTodoItem(withoutItem, destination, updatedItem);
}

function reorderTodoGroups(
    currentGroups: ImplementationTodoGroup[],
    requestedGroups: ImplementationTodoGroupOrder[],
    actor: 'agent' | 'user',
): ImplementationTodoGroup[] {
    const currentItems = currentGroups.flatMap((group) => group.items);
    const requestedIds = requestedGroups.flatMap((group) => group.itemIds);
    const requestedIdSet = new Set(requestedIds);
    if (requestedGroups.some((group) => group.name.trim() === '' || group.name.length > 60) ||
        new Set(requestedGroups.map((group) => group.name)).size !== requestedGroups.length ||
        requestedIds.length !== requestedIdSet.size) {
        throw new Error('TODO reorder contains duplicate IDs or invalid group names.');
    }
    const expectedItems = actor === 'agent' ? currentItems.filter((item) => item.createdBy !== 'user') : currentItems;
    const expectedIds = new Set(expectedItems.map((item) => item.id));
    if (requestedIds.length !== expectedIds.size || requestedIds.some((id) => !expectedIds.has(id))) {
        throw new Error('TODO reorder must include each editable item exactly once.');
    }
    const itemsById = new Map(currentItems.map((item) => [item.id, item]));
    const reordered = requestedGroups.map((group) => ({
        name: group.name,
        items: group.itemIds.map((id) => itemsById.get(id)!),
    }));
    if (actor === 'user') {
        return reordered;
    }

    const protectedGroups = currentGroups.map((group) => ({
        name: group.name,
        items: group.items.filter((item) => item.createdBy === 'user'),
    })).filter((group) => group.items.length > 0);
    for (const protectedGroup of protectedGroups) {
        let target = reordered.find((group) => group.name === protectedGroup.name);
        if (!target) {
            target = { name: protectedGroup.name, items: [] };
            const oldIndex = currentGroups.findIndex((group) => group.name === protectedGroup.name);
            reordered.splice(Math.min(oldIndex, reordered.length), 0, target);
        }
        const oldGroup = currentGroups.find((group) => group.name === protectedGroup.name)!;
        for (const protectedItem of protectedGroup.items) {
            const oldIndex = oldGroup.items.findIndex((item) => item.id === protectedItem.id);
            target.items.splice(Math.min(oldIndex, target.items.length), 0, protectedItem);
        }
    }
    return reordered;
}

function syncReviewGroup(
    currentGroups: ImplementationTodoGroup[],
    source: 'logic-review' | 'code-readability',
    groupName: string,
    drafts: ImplementationTodoItemDraft[],
    now: Date,
): ImplementationTodoGroup[] {
    const incomingBySource = new Map<string, ImplementationTodoItemDraft>();
    for (const draft of drafts) {
        if (draft.source !== source || incomingBySource.has(draft.sourceRef)) {
            throw new Error('Review TODO items must use unique source references for their review source.');
        }
        incomingBySource.set(draft.sourceRef, draft);
    }
    const existingGroup = currentGroups.find((group) => group.name === groupName);
    const existingReviewItems = existingGroup?.items.filter((item) => item.source === source && item.createdBy !== 'user') ?? [];
    const updatedItems = new Map<string, ImplementationTodoItem>();
    for (const existing of existingReviewItems) {
        const draft = incomingBySource.get(existing.sourceRef);
        if (!draft) {
            continue;
        }
        updatedItems.set(existing.sourceRef, {
            ...existing,
            ...draft,
            id: existing.id,
            createdBy: 'agent',
            done: existing.updatedBy === 'user' ? existing.done : draft.done,
            updatedBy: existing.updatedBy === 'user' ? 'user' : 'agent',
            updatedAt: existing.updatedBy === 'user' ? existing.updatedAt : toIsoSeconds(now),
        });
        incomingBySource.delete(existing.sourceRef);
    }
    let groups = currentGroups.map((group) => group.name !== groupName ? group : {
        ...group,
        items: group.items.filter((item) => item.source !== source || item.createdBy === 'user' || updatedItems.has(item.sourceRef))
            .map((item) => updatedItems.get(item.sourceRef) ?? item),
    });
    const additions = Array.from(incomingBySource.values()).map((draft) => ({
        ...draft,
        id: createTodoId(draft.title),
        createdBy: 'agent' as const,
        updatedBy: 'agent' as const,
        updatedAt: toIsoSeconds(now),
    }));
    if (!groups.some((group) => group.name === groupName)) {
        groups = [...groups, { name: groupName, items: additions }];
    } else {
        groups = groups.map((group) => group.name === groupName ? { ...group, items: [...group.items, ...additions] } : group);
    }
    return groups;
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