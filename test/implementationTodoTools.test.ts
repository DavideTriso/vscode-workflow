import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerImplementationTodoTools, todoToolNames } from '../src/tasks/implementationTodoTools';
import { TaskRepository } from '../src/tasks/taskRepository';

const vscodeMocks = vi.hoisted(() => ({
    tools: new Map<string, unknown>(),
}));

vi.mock('vscode', () => ({
    workspace: { workspaceFolders: [{ uri: { fsPath: '/workspace' } }] },
    lm: {
        registerTool: vi.fn((name: string, tool: unknown) => {
            vscodeMocks.tools.set(name, tool);
            return { dispose: vi.fn() };
        }),
    },
    LanguageModelTextPart: class {
        constructor(public value: string) { }
    },
    LanguageModelToolResult: class {
        constructor(public parts: unknown[]) { }
    },
}));

describe('implementation TODO language-model tools', () => {
    let repository: TaskRepository;
    let repositoryRoot: string;
    let subscriptions: Array<{ dispose(): void }>;

    beforeEach(async () => {
        vscodeMocks.tools.clear();
        repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'todo-tools-'));
        const taskDirectory = path.join(repositoryRoot, '.history', 'agents', 'task.json');
        await mkdir(taskDirectory, { recursive: true });
        await writeFile(path.join(taskDirectory, '.current'), JSON.stringify({
            taskId: 'task.json',
            taskName: 'Tool task',
            taskFile: '.history/tasks/task.json',
            startedAtDateTime: '2026-11-01T10:00:00Z',
        }));
        repository = new TaskRepository();
        vi.spyOn(repository, 'findRepositoryRoot').mockResolvedValue(repositoryRoot);
        subscriptions = [];
        registerImplementationTodoTools({ subscriptions } as never, repository);
    });

    afterEach(async () => {
        await rm(repositoryRoot, { recursive: true, force: true });
    });

    it('registers the four expected tools and reads the active task without accepting a model path', async () => {
        expect([...vscodeMocks.tools.keys()]).toEqual([
            todoToolNames.read,
            todoToolNames.manage,
            todoToolNames.syncLogic,
            todoToolNames.syncReadability,
        ]);
        const result = await invoke(todoToolNames.read, {});
        expect(result).toMatchObject({ version: 1, groups: [] });
    });

    it('uses the guarded repository API and rejects edits and removals of user-created items', async () => {
        const added = await invoke(todoToolNames.manage, {
            action: 'add',
            group: 'Implementation',
            item: createDraft({ title: 'Agent item' }),
        });
        const agentItemId = (added as { id: string }).id;
        await invoke(todoToolNames.manage, {
            action: 'update', itemId: agentItemId, changes: { title: 'Agent updated item' },
        });
        await repository.updateImplementationTodoItem(repositoryRoot, 'task.json', agentItemId, undefined, { done: true }, 'user');
        await expect(invoke(todoToolNames.manage, {
            action: 'update', itemId: agentItemId, changes: { done: false },
        })).rejects.toThrow('user-set TODO status');
        await invoke(todoToolNames.manage, {
            action: 'reconcile', itemId: agentItemId, changes: { done: false },
        });

        const userItem = await repository.addImplementationTodoItem(
            repositoryRoot, 'task.json', 'Notes', createDraft({ title: 'User item' }), 'user',
        );
        await expect(invoke(todoToolNames.manage, {
            action: 'update', itemId: userItem.id, changes: { title: 'Forbidden change' },
        })).rejects.toThrow('Agents cannot edit user-created');
        await expect(invoke(todoToolNames.manage, {
            action: 'reconcile', itemId: userItem.id, changes: { title: 'Forbidden plan edit' },
        })).rejects.toThrow('Agents cannot edit user-created');
        await expect(invoke(todoToolNames.manage, { action: 'remove', itemId: userItem.id }))
            .rejects.toThrow('Agents cannot remove user-created');

        const todo = await repository.readImplementationTodo(repositoryRoot, 'task.json');
        expect(todo.groups.flatMap((group) => group.items).map((item) => item.title)).toEqual(['Agent updated item', 'User item']);
        expect(todo.groups.flatMap((group) => group.items).find((item) => item.id === userItem.id)?.createdBy).toBe('user');
    });

    it('syncs logic findings and readability proposals to their fixed sources and groups', async () => {
        await invoke(todoToolNames.syncLogic, {
            items: [createDraft({
                title: 'Confirmed defect',
                sourceRef: 'logic-review.md#finding-1',
                source: undefined,
                done: false,
            })]
        });
        await invoke(todoToolNames.syncReadability, {
            items: [createDraft({
                title: 'Pending readability proposal',
                sourceRef: 'readability-review.md#recommendation-1',
                source: undefined,
                done: false,
            })]
        });

        const todo = await repository.readImplementationTodo(repositoryRoot, 'task.json');
        expect(todo.groups.map((group) => group.name)).toEqual(['Logic Review', 'Readability']);
        expect(todo.groups[0]?.items[0]).toMatchObject({ source: 'logic-review', done: false, createdBy: 'agent' });
        expect(todo.groups[1]?.items[0]).toMatchObject({ source: 'code-readability', done: false, createdBy: 'agent' });
    });

    it('seeds and revises the full selected plan in one tool call while preserving user TODOs', async () => {
        const userItem = await repository.addImplementationTodoItem(
            repositoryRoot, 'task.json', 'Notes', createDraft({ title: 'Remember this' }), 'user',
        );
        const planItem = { ...createDraft({ title: 'Build feature', source: 'plan', sourceRef: 'implementation-plan.md#step-1' }) };
        const initial = await invoke(todoToolNames.manage, {
            action: 'sync-plan',
            plan: 'implementation-plan.md',
            planGroups: [
                { name: 'Feature', items: [planItem] },
                { name: 'Verification', items: [{ ...planItem, title: 'Test feature', sourceRef: 'implementation-plan.md#step-2' }] },
            ],
        }) as { groups: Array<{ name: string; items: Array<{ id: string; sourceRef: string; createdBy: string }> }> };
        const originalPlanId = initial.groups[0]?.items[0]?.id;
        expect(initial.groups.map((group) => group.name)).toEqual(['Feature', 'Verification', 'Notes']);
        expect(initial.groups.flatMap((group) => group.items).find((item) => item.id === userItem.id)?.createdBy).toBe('user');

        const revised = await invoke(todoToolNames.manage, {
            action: 'sync-plan',
            plan: 'implementation-plan.md',
            planGroups: [{ name: 'Feature', items: [{ ...planItem, title: 'Build revised feature' }] }],
        }) as { groups: Array<{ name: string; items: Array<{ id: string; title: string; sourceRef: string; createdBy: string }> }> };
        expect(revised.groups.map((group) => group.name)).toEqual(['Feature', 'Notes']);
        expect(revised.groups[0]?.items[0]).toMatchObject({ id: originalPlanId, title: 'Build revised feature', sourceRef: 'implementation-plan.md#step-1' });
        expect(revised.groups[1]?.items[0]).toMatchObject({ id: userItem.id, title: 'Remember this', createdBy: 'user' });
    });
});

async function invoke(name: string, input: unknown): Promise<unknown> {
    const tool = vscodeMocks.tools.get(name) as {
        invoke(options: { input: unknown }, token: { isCancellationRequested: boolean }): Promise<{ parts: Array<{ value: string }> }>;
    };
    const result = await tool.invoke({ input }, { isCancellationRequested: false });
    return JSON.parse(result.parts[0]!.value);
}

function createDraft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        title: 'TODO item',
        done: false,
        source: 'request',
        sourceRef: 'request#item-1',
        why: 'Needed for the task.',
        files: [],
        decisions: '',
        acceptance: 'The result is verified.',
        evidence: '',
        remaining: '',
        alert: null,
        ...overrides,
    };
}