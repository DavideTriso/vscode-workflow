import { TaskRepository } from '../tasks/taskRepository';
import { resolveActiveTask, todoToolOperations } from '../tasks/todoToolOperations';

const toolNamePrefix = 'vscode-workflow_';
const fallbackProtocolVersion = '2025-06-18';

export interface McpToolDefinition {
    name: string;
    description: string;
    inputSchema: unknown;
}

/** A tool as declared in package.json `contributes.languageModelTools`. */
export interface ContributedTool {
    name: string;
    modelDescription: string;
    inputSchema: unknown;
}

export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id?: string | number | null;
    method: string;
    params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: string | number | null;
    result?: unknown;
    error?: { code: number; message: string };
}

export interface TodoMcpServerOptions {
    contributedTools: ContributedTool[];
    workspacePath: string;
    repository?: TaskRepository;
    serverVersion: string;
}

/** MCP tools are named without the VS Code publisher prefix, e.g. `read_implementation_todos`. */
export function toMcpToolName(contributedName: string): string {
    return contributedName.startsWith(toolNamePrefix) ? contributedName.slice(toolNamePrefix.length) : contributedName;
}

export function createTodoMcpServer(options: TodoMcpServerOptions) {
    const repository = options.repository ?? new TaskRepository();
    const tools = options.contributedTools.filter((tool) => tool.name in todoToolOperations);

    function listTools(): McpToolDefinition[] {
        return tools.map((tool) => ({
            name: toMcpToolName(tool.name),
            description: tool.modelDescription,
            inputSchema: tool.inputSchema,
        }));
    }

    async function callTool(name: string, input: unknown) {
        const contributed = tools.find((tool) => toMcpToolName(tool.name) === name);
        if (!contributed) {
            throw new Error(`Unknown tool: ${name}`);
        }
        try {
            const activeTask = await resolveActiveTask(repository, options.workspacePath);
            const operation = todoToolOperations[contributed.name];
            if (!operation) {
                throw new Error(`Unknown tool: ${name}`);
            }
            const result = await operation(repository, activeTask, (input ?? {}) as never);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { isError: true, content: [{ type: 'text', text: message }] };
        }
    }

    /** Returns undefined for notifications, which must not be answered. */
    async function handleMessage(message: JsonRpcRequest): Promise<JsonRpcResponse | undefined> {
        if (message.id === undefined || message.id === null) {
            return undefined;
        }
        const reply = (result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id: message.id!, result });
        const fail = (code: number, text: string): JsonRpcResponse =>
            ({ jsonrpc: '2.0', id: message.id!, error: { code, message: text } });

        switch (message.method) {
            case 'initialize':
                return reply({
                    protocolVersion: typeof message.params?.protocolVersion === 'string'
                        ? message.params.protocolVersion
                        : fallbackProtocolVersion,
                    capabilities: { tools: {} },
                    serverInfo: { name: 'vscode-workflow', version: options.serverVersion },
                });
            case 'ping':
                return reply({});
            case 'tools/list':
                return reply({ tools: listTools() });
            case 'tools/call': {
                const name = message.params?.name;
                if (typeof name !== 'string') {
                    return fail(-32602, 'tools/call requires a tool name.');
                }
                try {
                    return reply(await callTool(name, message.params?.arguments));
                } catch (error) {
                    return fail(-32602, error instanceof Error ? error.message : String(error));
                }
            }
            default:
                return fail(-32601, `Method not found: ${message.method}`);
        }
    }

    return { handleMessage, listTools };
}
