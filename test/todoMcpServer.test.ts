import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskRepository } from '../src/tasks/taskRepository';
import { createTodoMcpServer } from '../src/mcp/todoMcpServer';
import { todoToolDefinitions } from '../src/tasks/todoToolDefinitions';

describe('TODO MCP server for Claude Code', () => {
    let repositoryRoot: string;
    let server: ReturnType<typeof createTodoMcpServer>;

    beforeEach(async () => {
        repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'todo-mcp-'));
        const taskDirectory = path.join(repositoryRoot, '.history', 'agents', 'task.json');
        await mkdir(taskDirectory, { recursive: true });
        await writeFile(path.join(taskDirectory, '.current'), JSON.stringify({
            taskId: 'task.json',
            taskName: 'MCP task',
            taskFile: '.history/tasks/task.json',
            startedAtDateTime: '2026-11-01T10:00:00Z',
        }));
        const repository = new TaskRepository();
        vi.spyOn(repository, 'findRepositoryRoot').mockResolvedValue(repositoryRoot);
        server = createTodoMcpServer({
            tools: todoToolDefinitions,
            workspacePath: repositoryRoot,
            repository,
            serverVersion: '1.2.3',
        });
    });

    afterEach(async () => {
        await rm(repositoryRoot, { recursive: true, force: true });
    });

    const call = (name: string, args: unknown) =>
        server.handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });

    it('answers initialize with tool capabilities and echoes the client protocol version', async () => {
        const response = await server.handleMessage({
            jsonrpc: '2.0', id: 7, method: 'initialize', params: { protocolVersion: '2025-03-26' },
        });
        expect(response).toEqual({
            jsonrpc: '2.0',
            id: 7,
            result: {
                protocolVersion: '2025-03-26',
                capabilities: { tools: {} },
                serverInfo: { name: 'vscode-workflow', version: '1.2.3' },
            },
        });
    });

    it('never answers notifications', async () => {
        expect(await server.handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeUndefined();
    });

    it('lists exactly the defined TODO tools with their schemas', async () => {
        const response = await server.handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
        const tools = (response?.result as { tools: Array<{ name: string; inputSchema: unknown }> }).tools;
        expect(tools.map((tool) => tool.name)).toEqual([
            'read_implementation_todos',
            'manage_implementation_todos',
            'sync_logic_review_todos',
            'sync_code_readability_todos',
        ]);
        const manage = todoToolDefinitions.find((tool) => tool.name === 'manage_implementation_todos');
        expect(tools[1]?.inputSchema).toEqual(manage?.inputSchema);
    });

    it('runs the shared read, add, and protection rules', async () => {
        const read = await call('read_implementation_todos', {});
        expect(JSON.parse(textOf(read))).toMatchObject({ version: 1, groups: [] });

        const added = await call('manage_implementation_todos', {
            action: 'add',
            group: 'Work',
            item: {
                title: 'Write tests', done: false, source: 'plan', sourceRef: 'implementation-plan.md#step-1',
                why: 'Coverage', files: [], decisions: '', acceptance: '', evidence: '', remaining: '', alert: null,
            },
        });
        expect(added?.result).not.toHaveProperty('isError');
        const after = JSON.parse(textOf(await call('read_implementation_todos', {})));
        expect(after.groups[0].items[0]).toMatchObject({ title: 'Write tests', createdBy: 'agent' });
    });

    it('keeps the selected readability proposals in the Code Readability group across reviews', async () => {
        const itemFields = {
            done: false, why: 'Hard to follow', files: ['src/a.ts'], decisions: 'Extract a helper', acceptance: 'Same behavior',
            evidence: '', remaining: 'Not implemented', alert: null,
        };
        const proposal = (number: number) => ({
            ...itemFields, title: `Readability proposal ${number}`, sourceRef: `readability-review.md#recommendation-${number}`,
        });
        await call('manage_implementation_todos', {
            action: 'add',
            group: 'Code Readability',
            item: { ...itemFields, title: 'Note from another source', source: 'user-note', sourceRef: 'user:note' },
        });
        await call('sync_code_readability_todos', { items: [proposal(1), proposal(3)] });
        const secondReview = await call('sync_code_readability_todos', { items: [proposal(1), proposal(3), proposal(5)] });
        expect(secondReview?.result).not.toHaveProperty('isError');

        let todo = JSON.parse(textOf(await call('read_implementation_todos', {})));
        expect(todo.groups.map((group: { name: string }) => group.name)).toEqual(['Code Readability']);
        expect(todo.groups[0].items.map((item: { title: string }) => item.title)).toEqual([
            'Note from another source', 'Readability proposal 1', 'Readability proposal 3', 'Readability proposal 5',
        ]);
        expect(todo.groups[0].items[1]).toMatchObject({ source: 'code-readability', createdBy: 'agent', done: false });

        await call('sync_code_readability_todos', { items: [{ ...proposal(1), done: true }, proposal(5)] });
        todo = JSON.parse(textOf(await call('read_implementation_todos', {})));
        expect(todo.groups[0].items.map((item: { title: string; done: boolean }) => [item.title, item.done])).toEqual([
            ['Note from another source', false], ['Readability proposal 1', true], ['Readability proposal 5', false],
        ]);
    });

    it('leaves readability items in other groups untouched when the Code Readability set is synced', async () => {
        const legacy = {
            title: 'Legacy proposal', done: false, source: 'code-readability', sourceRef: 'readability-review.md#recommendation-1',
            why: '', files: [], decisions: '', acceptance: '', evidence: '', remaining: 'pending user approval', alert: null,
        };
        await call('manage_implementation_todos', { action: 'add', group: 'Readability', item: legacy });
        const { source: _source, ...selected } = { ...legacy, title: 'Selected proposal', sourceRef: 'readability-review.md#recommendation-2', remaining: '' };
        await call('sync_code_readability_todos', { items: [selected] });
        await call('sync_code_readability_todos', { items: [{ ...selected, done: true }] });

        const todo = JSON.parse(textOf(await call('read_implementation_todos', {})));
        expect(todo.groups.map((group: { name: string; items: Array<{ title: string; done: boolean }> }) => [
            group.name, group.items.map((item) => [item.title, item.done]),
        ])).toEqual([
            ['Readability', [['Legacy proposal', false]]],
            ['Code Readability', [['Selected proposal', true]]],
        ]);
    });

    it('returns tool failures as isError results the model can read', async () => {
        const response = await call('manage_implementation_todos', { action: 'add' });
        expect(response?.result).toMatchObject({ isError: true });
        expect(textOf(response)).toContain('The add action requires a group and item.');
    });

    it('reports a missing active task as a tool error, not a protocol error', async () => {
        await rm(path.join(repositoryRoot, '.history'), { recursive: true });
        const response = await call('read_implementation_todos', {});
        expect(response?.error).toBeUndefined();
        expect(response?.result).toMatchObject({ isError: true });
    });

    it('rejects unknown tools and methods with JSON-RPC errors', async () => {
        expect((await call('nope', {}))?.error?.code).toBe(-32602);
        expect((await server.handleMessage({ jsonrpc: '2.0', id: 3, method: 'bogus' }))?.error?.code).toBe(-32601);
    });
});

function textOf(response: { result?: unknown } | undefined): string {
    return (response?.result as { content: Array<{ text: string }> }).content[0]!.text;
}
