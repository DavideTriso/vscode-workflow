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
        for (const name of ['implement', 'analyze-and-plan', 'debug', 'commit-message', 'install-git-crypt', 'agents-md']) {
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


    const sharedFiles = [
        { file: 'agents-md-rules.md', owner: 'agents-md', readers: ['analyze-and-plan', 'implement', 'debug'], heading: '# AGENTS.md rules' },
        { file: 'todo-contract.md', owner: 'implement', readers: ['analyze-and-plan'], heading: '# Implementation TODO contract' },
        { file: 'documentation-standards.md', owner: 'documentation-create-default', readers: ['documentation-update-default'], heading: '# Documentation Standards' },
    ];

    it('keeps one copy of each shared skill file, in its owner skill, and points the other skills to it', async () => {
        for (const { file, owner, readers, heading } of sharedFiles) {
            expect(await read('skills', owner, 'SKILL.md'), owner).toContain(`\`${file}\`, located next to this SKILL.md`);
            await expect(read('skills', owner, file), owner).resolves.toContain(heading);
            for (const name of readers) {
                const skill = await read('skills', name, 'SKILL.md');
                const expectedPath = `../${owner}/${file}`;
                expect(skill, name).toContain(`at \`${expectedPath}\` relative to this skill's base directory`);
                await expect(read('skills', name, expectedPath), name).resolves.toContain(heading);
                await expect(read('skills', name, file), `${name} must not keep a copy of ${file}`).rejects.toThrow();
            }
        }
    });

    it('adds rules to AGENTS.md only when it exists and the user approves', async () => {
        const rules = await read('skills', 'agents-md', 'agents-md-rules.md');
        expect(rules).toContain('If it does not exist, skip this section completely');
        expect(rules).toContain('Write only the rules the user approves');
        for (const name of ['analyze-and-plan', 'implement', 'debug']) {
            const skill = await read('skills', name, 'SKILL.md');
            expect(skill, name).toContain('Add a rule only after the user approves it. If there is no `AGENTS.md`, skip this step.');
        }
    });

    it('makes the agents-md skill wait for approval and offer the CLAUDE.md import', async () => {
        const skill = await read('skills', 'agents-md', 'SKILL.md');
        expect(skill).toContain('Do not write until they confirm');
        expect(skill).toContain('`@AGENTS.md`');
        expect(skill).toContain('Write only after a yes');
    });

    it('makes the logic and readability reviewers read AGENTS.md without editing it', async () => {
        for (const agent of ['logic-review', 'code-readability']) {
            const text = await read('agents', agent + '.md');
            expect(text, agent).toContain('read `AGENTS.md` at the repository root when it exists');
            expect(text, agent).toContain('Never edit `AGENTS.md`');
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

    const launchers = [
        { skill: 'logic-review-default', agent: 'logic-review' },
        { skill: 'code-readability-default', agent: 'code-readability' },
        { skill: 'documentation-update-default', agent: 'document' },
        { skill: 'code-comment-review', agent: 'code-comments' },
        { skill: 'code-comment-improve', agent: 'code-comments' },
    ];

    it('makes each review, documentation and comment skill start its subagent', async () => {
        for (const { skill, agent } of launchers) {
            const text = await read('skills', skill, 'SKILL.md');
            expect(text, skill).toContain(`\`subagent_type\` set to \`vscode-workflow:${agent}\``);
            expect(text, skill).toMatch(/If the subagent cannot be started, tell the user and suggest running `\/reload-plugins`\. Do not .+ in this conversation instead\./);
        }
    });

    it('keeps the criteria in the subagents, which do not load skills', async () => {
        for (const agent of ['logic-review', 'code-readability', 'document', 'code-comments']) {
            const text = await read('agents', agent + '.md');
            expect(frontmatter(text).tools.split(',').map((tool) => tool.trim()), agent).not.toContain('Skill');
            expect(text, agent).not.toMatch(/with the `vscode-workflow:[\w-]+` skill/);
        }
    });

    it('passes the documentation standards path from the launcher to the Document subagent', async () => {
        const skill = await read('skills', 'documentation-update-default', 'SKILL.md');
        expect(skill).toContain('the absolute path of `documentation-standards.md`');
        expect(skill).toContain('Status: Awaiting Confirmation');
        const agent = await read('agents', 'document.md');
        expect(agent).toContain('at the absolute path given in your brief');
    });

    it('ships the commit-message skill with rules that name every prefix and the detail format', async () => {
        const rules = await read('skills', 'commit-message', 'commit-message-rules.md');
        for (const prefix of ['BC', 'New', 'Ref', 'Fix', 'Doc']) {
            expect(rules, prefix).toContain(`| \`${prefix}\` |`);
        }
        expect(rules).toContain('<Prefix>: <short summary>');
        expect(rules).toContain('Each detail line starts with `- `');
        expect(rules).toContain('`BC`, `New`, `Fix`, `Ref`, `Doc`');
        expect(rules).toContain('`Co-Authored-By`');
    });

    it('makes the commit-message skill read its rules, the task and the reports, and never commit', async () => {
        const skill = await read('skills', 'commit-message', 'SKILL.md');
        expect(skill).toContain('`commit-message-rules.md`, located next to this SKILL.md');
        expect(skill).toContain('`name` and `description`');
        expect(skill).toContain('every `*.md` file in the folder that contains the marker');
        expect(skill).toContain("':(exclude).history'");
        expect(skill).toContain('does not stage files and does not run `git commit`');
        expect(skill).toContain('Do not read `implementation-todo.json`');
        expect(skill).not.toContain('allowed-tools');
    });

    it('keeps the Code Comments subagent from writing reports', async () => {
        const agent = await read('agents', 'code-comments.md');
        expect(agent).toContain('Never write a summary, report, or any file under `.history/agents/`');
        for (const skill of ['code-comment-review', 'code-comment-improve']) {
            expect(await read('skills', skill, 'SKILL.md'), skill).toContain('.history/agents/');
        }
    });

    it('guides git-crypt installation one step at a time and never asks for secrets', async () => {
        const text = await read('skills', 'install-git-crypt', 'SKILL.md');
        expect(text).toContain('One step per message');
        expect(text).toContain('wait');
        expect(text).toMatch(/Never ask for a passphrase/);
        for (const check of ['uname -a', '/etc/os-release', 'sw_vers', 'git --version', 'gpg --version', 'git-crypt --version']) {
            expect(text).toContain(check);
        }
    });
});
