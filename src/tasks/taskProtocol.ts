import type { HistoryEncryptionNotice, HistoryEncryptionRequest } from '../crypt/historyEncryptionMessages';

export interface TaskSummary {
    id: string;
    name: string;
    createdOnDateTime: string;
    projectManagementUrl: string;
    description: string;
    createdBy?: string;
    assignee?: string;
    status: TaskStatus;
    timeTracking: TimeTrackingEntry[];
    relatedTasks: RelatedTaskReference[];
}

/**
 * A link from a task to another task in the same repository or in a repository of the same
 * repository group. `repositoryUrl` identifies the repository across machines; `repositoryPath`
 * is the local path when the link was made. Names are snapshots kept for display and for agents
 * when the repository cannot be found.
 */
export interface RelatedTaskReference {
    taskId: string;
    taskName: string;
    repositoryName: string;
    repositoryPath: string;
    repositoryUrl: string;
}

/** A task that can be linked as related task, offered in the task form. */
export interface RelatedTaskCandidate extends RelatedTaskReference {
    status: TaskStatus;
    isCurrentRepository: boolean;
}

/** The open repository as related-task links describe it. */
export interface CurrentRepositoryInfo {
    name: string;
    path: string;
    originUrl: string;
}

export interface RepositoryConfig {
    path: string;
    originUrl: string;
    name: string;
    description: string;
}

export interface RepositoryGroup {
    group: string;
    repositories: RepositoryConfig[];
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
    assignee: string;
    relatedTasks: RelatedTaskReference[];
}

export interface UserIdentity {
    email: string;
    name?: string;
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

/** An agent whose output files the Tasks view shows in one accordion. */
export interface OutputAgentDefinition {
    id: string;
    name: string;
    /** The exact file name of a single-file output, or of a legacy file of a multi-file output. */
    fileName?: string;
    /** The prefix of a multi-file output, for example `debug-` for `debug-<timestamp>-<name>.md` reports. */
    filePrefix?: string;
    /** `list` shows one row with a summary and a view button per file. */
    layout?: 'list';
}

export const outputAgents = [
    { id: 'analyze-and-plan', name: 'Analyze and Plan', fileName: 'implementation-plan.md' },
    { id: 'logic-review', name: 'Logic Review', fileName: 'logic-review.md' },
    { id: 'code-readability', name: 'Code Readability', fileName: 'readability-review.md' },
    { id: 'document', name: 'Document', fileName: 'documentation-update.md' },
    { id: 'debug', name: 'Debug', fileName: 'debug-report.md', filePrefix: 'debug-', layout: 'list' },
    { id: 'implement', name: 'Implementation TODOs', fileName: 'implementation-todo.json' },
    { id: 'implement-summary', name: 'Implementation summaries', filePrefix: 'implement-', layout: 'list' },
] as const satisfies readonly OutputAgentDefinition[];

/**
 * Returns true when a plain file name is an output of the agent: its exact `fileName`, or its
 * `filePrefix` followed by letters, digits, dots, hyphens or underscores and `.md`.
 */
export function isAgentOutputFile(agent: OutputAgentDefinition, fileName: string): boolean {
    if (agent.fileName === fileName) {
        return true;
    }
    if (!agent.filePrefix || !fileName.startsWith(agent.filePrefix)) {
        return false;
    }
    return /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(fileName.slice(agent.filePrefix.length));
}

/** Returns true when the accordion of the output agent lists its files as rows. */
export function isListOutputAgent(agentId: string): boolean {
    const agent: OutputAgentDefinition | undefined = outputAgents.find((candidate) => candidate.id === agentId);
    return agent?.layout === 'list';
}

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
    | { type: 'taskList'; tasks: TaskSummary[]; currentUser?: string; currentRepository?: CurrentRepositoryInfo }
    | { type: 'openEditForm'; task: TaskSummary }
    | { type: 'createTaskValidationError'; errors: TaskFieldErrors }
    | { type: 'createTaskFailed'; message: string }
    | { type: 'taskSaved' }
    | { type: 'taskSettings'; requireProjectManagementUrl: boolean; teamMembers: string[] }
    | { type: 'taskActionUpdated'; task: TaskSummary }
    | { type: 'taskActionFailed'; message: string }
    | { type: 'taskActionCancelled' }
    | { type: 'selectedTask'; task: TaskSummary }
    | { type: 'agentOutputs'; taskId: string; groups: AgentOutputGroup[]; error?: string }
    | { type: 'todoStatusResult'; taskId: string; itemId: string; done: boolean; error?: string }
    | { type: 'todoMutationResult'; taskId: string; error?: string }
    | { type: 'relatedTaskCandidates'; candidates: RelatedTaskCandidate[]; error?: string }
    | { type: 'clearSelectedTask' }
    | HistoryEncryptionNotice;

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
    | { type: 'loadRelatedTaskCandidates' }
    | { type: 'openRelatedTask'; taskId: string; reference: RelatedTaskReference }
    | { type: 'markTaskDone'; taskId: string }
    | { type: 'toggleTimeTracking'; taskId: string }
    | { type: 'saveTask'; taskId?: string; input: CreateTaskInput; sourceTodo?: TodoReference }
    | HistoryEncryptionRequest;

/** A TODO item a new task is created from; it is removed once the task is saved. */
export interface TodoReference {
    taskId: string;
    itemId: string;
}