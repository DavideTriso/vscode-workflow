export interface TaskSummary {
    id: string;
    name: string;
    createdOnDateTime: string;
    projectManagementUrl: string;
    description: string;
    createdBy?: string;
    status: TaskStatus;
    timeTracking: TimeTrackingEntry[];
}

export type TaskStatus = 0 | 1 | 2;

export interface TimeTrackingEntry {
    startDateTime: string;
    endDateTime: string | null;
    user?: string;
}

export interface CreateTaskInput {
    name: string;
    projectManagementUrl: string;
    description: string;
}

export type TaskFieldErrors = Partial<Record<keyof CreateTaskInput, string>>;

export type ImplementationTodoSource = 'plan' | 'request' | 'user-note' | 'logic-review' | 'code-readability';

export interface ImplementationTodoItem {
    id: string;
    title: string;
    done: boolean;
    source: ImplementationTodoSource;
    sourceRef: string;
    why: string;
    files: string[];
    decisions: string;
    acceptance: string;
    evidence: string;
    remaining: string;
    alert: string | null;
    createdBy: 'agent' | 'user';
    updatedBy: 'agent' | 'user';
    updatedAt: string;
}

export type ImplementationTodoItemDraft = Omit<ImplementationTodoItem, 'id' | 'createdBy' | 'updatedBy' | 'updatedAt'>;

export interface ImplementationTodoGroupOrder {
    name: string;
    itemIds: string[];
}

export interface ImplementationTodoGroup {
    name: string;
    items: ImplementationTodoItem[];
}

export interface ImplementationTodoDocument {
    version: 1;
    summary: string;
    plan: string;
    planSyncedAt: string;
    groups: ImplementationTodoGroup[];
}

export const outputAgents = [
    { id: 'analyze-and-plan', name: 'Analyze and Plan', fileName: 'implementation-plan.md' },
    { id: 'logic-review', name: 'Logic Review', fileName: 'logic-review.md' },
    { id: 'code-readability', name: 'Code Readability', fileName: 'readability-review.md' },
    { id: 'document', name: 'Document', fileName: 'documentation-update.md' },
    { id: 'debug', name: 'Debug', fileName: 'debug-report.md' },
    { id: 'implement', name: 'Implementation TODOs', fileName: 'implementation-todo.json' },
] as const;

export interface AgentOutputFile {
    fileName: string;
    summary: string;
}

export interface AgentOutputGroup {
    id: typeof outputAgents[number]['id'];
    name: string;
    files: AgentOutputFile[];
    todoGroups?: ImplementationTodoGroup[];
    error?: string;
}

export type ExtensionToWebviewMessage =
    | { type: 'repositoryUnavailable' }
    | { type: 'taskList'; tasks: TaskSummary[]; gitUserEmail?: string }
    | { type: 'openEditForm'; task: TaskSummary }
    | { type: 'createTaskValidationError'; errors: TaskFieldErrors }
    | { type: 'createTaskFailed'; message: string }
    | { type: 'taskSaved' }
    | { type: 'taskActionUpdated'; task: TaskSummary }
    | { type: 'taskActionFailed'; message: string }
    | { type: 'taskActionCancelled' }
    | { type: 'selectedTask'; task: TaskSummary }
    | { type: 'agentOutputs'; taskId: string; groups: AgentOutputGroup[]; error?: string }
    | { type: 'todoStatusResult'; taskId: string; itemId: string; done: boolean; error?: string }
    | { type: 'todoMutationResult'; taskId: string; error?: string }
    | { type: 'clearSelectedTask' };

export type WebviewToExtensionMessage =
    | { type: 'ready' }
    | { type: 'deleteTask'; taskId: string }
    | { type: 'openTaskFile'; taskId: string }
    | { type: 'viewAgentOutput'; taskId: string; fileName: string }
    | { type: 'viewTodo'; taskId: string; itemId: string }
    | { type: 'setTodoStatus'; taskId: string; itemId: string; done: boolean }
    | { type: 'createTodo'; taskId: string; group: string; item: ImplementationTodoItemDraft }
    | { type: 'updateTodo'; taskId: string; itemId: string; group: string; changes: Partial<ImplementationTodoItemDraft> }
    | { type: 'removeTodo'; taskId: string; itemId: string }
    | { type: 'reorderTodos'; taskId: string; groups: ImplementationTodoGroupOrder[] }
    | { type: 'editTask'; taskId: string }
    | { type: 'selectTask'; taskId: string }
    | { type: 'refreshTasks' }
    | { type: 'markTaskDone'; taskId: string }
    | { type: 'toggleTimeTracking'; taskId: string }
    | { type: 'saveTask'; taskId?: string; input: CreateTaskInput };