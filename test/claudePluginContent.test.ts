import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { todoToolDefinitions } from '../src/tasks/todoToolDefinitions';
import { claudePluginName } from '../src/claude/claudePlugin';

const pluginRoot = path.resolve(__dirname, '..', 'claude-plugin');
const mcpPrefix = `mcp__plugin_${claudePluginName}_todos__`;
const mcpToolNames = todoToolDefinitions.map((tool) => tool.name);

function frontmatter(text: string): Record<string, string> {
    const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
    expect(match, 'file must start with YAML frontmatter').not.toBeNull();
    return Object.fromEntries(match![1]!.split('\n').map((line) => {
        const index = line.indexOf(':');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }));
}

async function read(...segments: string[]): Promise<string> {
    return readFile(path.join(pluginRoot, ...segments), 'utf8');
}

describe('Claude Code plugin content', () => {
    it('ships the four reviewer subagents with valid frontmatter', async () => {
        const files = (await readdir(path.join(pluginRoot, 'agents'))).sort();
        expect(files).toEqual(['code-comments.md', 'code-readability.md', 'document.md', 'logic-review.md']);
        for (const file of files) {
            const meta = frontmatter(await read('agents', file));
            expect(meta.name).toBe(file.replace(/\.md$/, ''));
            expect(meta.description).toBeTruthy();
            expect(meta.tools).toBeTruthy();
        }
    });

    it('ships the interactive workflows as user-invoked skills, not subagents', async () => {
        for (const name of ['implement', 'analyze-and-plan', 'debug']) {
            const meta = frontmatter(await read('skills', name, 'SKILL.md'));
            expect(meta.name).toBe(name);
            expect(meta['disable-model-invocation']).toBe('true');
        }
    });

    it('keeps every skill folder name equal to its skill name', async () => {
        for (const name of await readdir(path.join(pluginRoot, 'skills'))) {
            expect(frontmatter(await read('skills', name, 'SKILL.md')).name).toBe(name);
        }
    });

    it('only references MCP tools the server actually exposes', async () => {
        const files = [
            ...(await readdir(path.join(pluginRoot, 'agents'))).map((file) => ['agents', file]),
            ...['implement', 'analyze-and-plan', 'debug'].map((name) => ['skills', name, 'SKILL.md']),
        ];
        for (const file of files) {
            const text = await read(...file);
            for (const [, tool] of text.matchAll(/mcp__plugin_[\w-]+?_todos__(\w+)/g)) {
                expect(mcpToolNames, `${file.join('/')} references ${tool}`).toContain(tool);
            }
            expect(text).not.toMatch(/davidetriso\.|vscode-workflow_(read|manage|sync)_/);
        }
    });

    it('gives each reviewer agent only the TODO sync tool it owns', async () => {
        const readability = frontmatter(await read('agents', 'code-readability.md')).tools;
        expect(readability).toContain(`${mcpPrefix}sync_code_readability_todos`);
        expect(readability).not.toContain('sync_logic_review_todos');
        const logic = frontmatter(await read('agents', 'logic-review.md')).tools;
        expect(logic).toContain(`${mcpPrefix}sync_logic_review_todos`);
        expect(logic).not.toContain('sync_code_readability_todos');
    });

    it('points the MCP config at the bundled server and the plugin name matches', async () => {
        const mcp = JSON.parse(await read('.mcp.json'));
        expect(mcp.mcpServers.todos.args).toEqual(['${CLAUDE_PLUGIN_ROOT}/mcp-server.js']);
        expect(JSON.parse(await read('.claude-plugin', 'plugin.json')).name).toBe(claudePluginName);
    });

    it('keeps upstream attribution for the adapted debug skill', async () => {
        expect(await read('skills', 'debug', 'SKILL.md')).toContain('github/awesome-copilot/blob/main/agents/debug.agent.md');
        const notices = await readFile(path.resolve(__dirname, '..', 'THIRD_PARTY_NOTICES.md'), 'utf8');
        expect(notices).toContain('Copyright GitHub, Inc.');
        expect(notices).toContain('MIT License');
    });

    it('tells every task-reading agent and skill to read related tasks read-only', async () => {
        const files = [
            ...(await readdir(path.join(pluginRoot, 'agents'))).map((file) => ['agents', file]),
            ...['implement', 'analyze-and-plan', 'debug'].map((name) => ['skills', name, 'SKILL.md']),
        ];
        for (const file of files) {
            const text = await read(...file);
            expect(text, file.join('/')).toContain('`relatedTasks`');
            expect(text, file.join('/')).toContain('read-only context');
        }
    });

    it('preserves the planning contracts in the Claude skill', async () => {
        const planning = await read('skills', 'analyze-and-plan', 'SKILL.md');
        for (const phrase of [
            'Status: Awaiting Decision', 'Status: Selected', '## Full Plan',
            'exactly once with `action: "sync-plan"`', 'Do not create or change the TODO list while the plan awaits a decision.',
        ]) {
            expect(planning).toContain(phrase);
        }
    });
});
