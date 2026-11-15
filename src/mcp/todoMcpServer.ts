import { TaskRepository } from '../tasks/taskRepository';
import type { TodoToolDefinition } from '../tasks/todoToolDefinitions';
import { resolveActiveTask, todoToolOperations } from '../tasks/todoToolOperations';

const fallbackProtocolVersion = '2025-06-18';

export interface McpToolDefinition {
    name: string;
    description: string;
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
    tools: TodoToolDefinition[];
    workspacePath: string;
    repository?: TaskRepository;
    serverVersion: string;
}

export function createTodoMcpServer(options: TodoMcpServerOptions) {
    const repository = options.repository ?? new TaskRepository();
    const tools = options.tools.filter((tool) => tool.name in todoToolOperations);

    function listTools(): McpToolDefinition[] {
        return tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
        }));
    }

    async function callTool(name: string, input: unknown) {
        const tool = tools.find((candidate) => candidate.name === name);
        if (!tool) {
            throw new Error(`Unknown tool: ${name}`);
        }
        try {
            const activeTask = await resolveActiveTask(repository, options.workspacePath);
            const operation = todoToolOperations[tool.name];
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
