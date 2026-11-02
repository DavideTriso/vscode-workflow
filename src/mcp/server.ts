import { createInterface } from 'node:readline';
import manifest from '../../package.json';
import { createTodoMcpServer, type JsonRpcRequest } from './todoMcpServer';

/**
 * Stdio entry point launched by Claude Code from the plugin's .mcp.json.
 * Claude Code starts MCP servers in the project directory, which is the repository to operate on.
 */
const server = createTodoMcpServer({
    contributedTools: manifest.contributes.languageModelTools,
    workspacePath: process.env.WORKFLOW_WORKSPACE || process.cwd(),
    serverVersion: manifest.version,
});

const lines = createInterface({ input: process.stdin });
const pending = new Set<Promise<void>>();

lines.on('line', (line) => {
    if (!line.trim()) {
        return;
    }
    const work = handleLine(line).finally(() => pending.delete(work));
    pending.add(work);
});

// Finish in-flight writes before exiting when the client closes stdin.
lines.on('close', () => {
    void Promise.all(pending).then(() => process.exit(0));
});

async function handleLine(line: string): Promise<void> {
    let message: JsonRpcRequest;
    try {
        message = JSON.parse(line);
    } catch {
        send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
        return;
    }
    const response = await server.handleMessage(message);
    if (response) {
        send(response);
    }
}

function send(response: unknown): void {
    process.stdout.write(`${JSON.stringify(response)}\n`);
}
