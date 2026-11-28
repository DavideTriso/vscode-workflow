import { buildAssigneeOptions, filterTasks, getUserEmail, isSameRelatedTask, validateTaskInput } from '../../tasks/taskModel';
import { describeImplementationTodoItem } from '../../tasks/implementationTodo';
import { isListOutputAgent, outputAgents } from '../../tasks/taskProtocol';
import { isHistoryEncryptionNotice, type HistoryEncryptionNotice } from '../../crypt/historyEncryptionMessages';
import { initHistoryEncryptionView } from './historyEncryptionView';
import type {
    AgentOutputFile,
    AgentOutputGroup,
    CreateTaskInput,
    ExtensionToWebviewMessage,
    CurrentRepositoryInfo,
    ImplementationTodoItem,
    ImplementationTodoItemDraft,
    RelatedTaskCandidate,
    RelatedTaskReference,
    TaskFieldErrors,
    TaskSummary,
    TodoReference,
    WebviewToExtensionMessage,
} from '../../tasks/taskProtocol';

declare function acquireVsCodeApi(): {
    postMessage(message: WebviewToExtensionMessage): void;
};

const vscode = acquireVsCodeApi();
const repositoryMessage = document.querySelector<HTMLParagraphElement>('#repository-message');
const taskPanel = document.querySelector<HTMLElement>('#task-panel');
const selectedTaskPanel = document.querySelector<HTMLElement>('#selected-task-panel');
const selectedTaskName = document.querySelector<HTMLHeadingElement>('#selected-task-name');
const selectedTaskDescription = document.querySelector<HTMLParagraphElement>('#selected-task-description');
const descriptionToggle = document.querySelector<HTMLButtonElement>('#description-toggle');
const selectedTaskRelated = document.querySelector<HTMLElement>('#selected-task-related');
const selectedTaskRelatedList = document.querySelector<HTMLUListElement>('#selected-task-related-list');
const agentOutputsPanel = document.querySelector<HTMLElement>('#agent-outputs');
const agentOutputError = document.querySelector<HTMLParagraphElement>('#agent-output-error');
const timeTrackingToggle = document.querySelector<HTMLButtonElement>('#time-tracking-toggle');
const taskStatusToggle = document.querySelector<HTMLButtonElement>('#task-status-toggle');
const taskActionError = document.querySelector<HTMLParagraphElement>('#task-action-error');
const taskListPanel = document.querySelector<HTMLElement>('#task-list-panel');
const tasksAccordionToggle = document.querySelector<HTMLButtonElement>('#tasks-accordion-toggle');
const tasksAccordionContent = document.querySelector<HTMLElement>('#tasks-accordion-content');
const quickReferenceToggle = document.querySelector<HTMLButtonElement>('#quick-reference-toggle');
const quickReferenceContent = document.querySelector<HTMLElement>('#quick-reference-content');
const addTaskButton = document.querySelector<HTMLButtonElement>('#add-task-button');
const reloadTasksButton = document.querySelector<HTMLButtonElement>('#reload-tasks-button');
const searchInput = document.querySelector<HTMLInputElement>('#task-search');
const assigneeFilterToggle = document.querySelector<HTMLButtonElement>('#creator-filter-toggle');
const taskList = document.querySelector<HTMLUListElement>('#task-list');
const emptyMessage = document.querySelector<HTMLParagraphElement>('#empty-message');
const createTaskPanel = document.querySelector<HTMLElement>('#create-task-panel');
const createTaskForm = document.querySelector<HTMLFormElement>('#create-task-form');
const taskNameInput = document.querySelector<HTMLInputElement>('#task-name');
const taskUrlInput = document.querySelector<HTMLInputElement>('#task-url');
const taskDescriptionInput = document.querySelector<HTMLTextAreaElement>('#task-description');
const taskAssigneeInput = document.querySelector<HTMLSelectElement>('#task-assignee');
const taskFormHeading = document.querySelector<HTMLHeadingElement>('#create-task-heading');
const createTaskSubmit = document.querySelector<HTMLButtonElement>('#create-task-submit');
const cancelCreateTask = document.querySelector<HTMLButtonElement>('#cancel-create-task');
const createTaskError = document.querySelector<HTMLParagraphElement>('#create-task-error');
const relatedTaskList = document.querySelector<HTMLUListElement>('#task-related-list');
const addRelatedTaskButton = document.querySelector<HTMLButtonElement>('#task-related-add');
const relatedTaskStatus = document.querySelector<HTMLParagraphElement>('#task-related-status');
const fieldInputIds: Record<keyof CreateTaskInput, string> = {
    name: 'task-name',
    projectManagementUrl: 'task-url',
    description: 'task-description',
    assignee: 'task-assignee',
    relatedTasks: 'task-related-add',
};
const fieldErrorIds: Record<keyof CreateTaskInput, string> = {
    name: 'task-name-error',
    projectManagementUrl: 'task-url-error',
    description: 'task-description-error',
    assignee: 'task-assignee-error',
    relatedTasks: 'task-related-error',
};
let tasks: TaskSummary[] = [];
let editingTaskId: string | undefined;
let selectedTask: TaskSummary | undefined;
let taskActionPending = false;
let filterByAssignee = true;
let requireProjectManagementUrl = true;
let currentUser: string | undefined;
let currentRepository: CurrentRepositoryInfo | undefined;
let teamMembers: string[] = [];
let outputTaskId: string | undefined;
let agentOutputs: AgentOutputGroup[] = [];
const expandedOutputAgents = new Set<string>();
const selectedOutputFiles = new Map<string, string>();
const pendingTodoChanges = new Map<string, boolean>();
let draggedTodoItemId: string | undefined;
let todoEditorState: { taskId: string; itemId?: string; groupName: string } | undefined;
/** The TODO the open "New task" form was pre-filled from; it is removed when that task is saved. */
let taskSourceTodo: TodoReference | undefined;
/** Tasks that can be linked as related tasks; loaded each time the task form opens. */
let relatedTaskCandidates: RelatedTaskCandidate[] = [];
let relatedTaskCandidatesLoaded = false;
/** The task chosen in each related-task row; a row without an entry has no valid selection yet. */
const relatedTaskSelections = new WeakMap<HTMLLIElement, RelatedTaskReference>();
let relatedTaskRowCount = 0;
const actionIcons = {
    view: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h9l5 5v13H5zM14 3v6h6M8 14h8M8 17h8"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L20 7.5 16.5 4 4 16.5zM14.8 5.7l3.5 3.5"/></svg>',
    remove: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 5v5m4-5v5"/></svg>',
    createTask: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h11v4M4 4v16h8M15 13v8M11 17h8"/></svg>',
    more: '<svg class="filled-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="3.5" r="1.25"/><circle cx="8" cy="8" r="1.25"/><circle cx="8" cy="12.5" r="1.25"/></svg>',
    add: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>',
};

if (
    repositoryMessage && taskPanel && selectedTaskPanel && selectedTaskName && selectedTaskDescription && descriptionToggle &&
    timeTrackingToggle && taskStatusToggle && taskActionError &&
    taskListPanel && tasksAccordionToggle && tasksAccordionContent && quickReferenceToggle && quickReferenceContent &&
    addTaskButton && reloadTasksButton &&
    searchInput && assigneeFilterToggle && taskList && emptyMessage && createTaskPanel &&
    createTaskForm && taskNameInput && taskUrlInput && taskDescriptionInput && taskAssigneeInput && createTaskSubmit &&
    cancelCreateTask && createTaskError
) {
    const handleHistoryEncryptionNotice = initHistoryEncryptionView((request) => vscode.postMessage(request));
    window.addEventListener('message', (event: MessageEvent<ExtensionToWebviewMessage>) => {
        if (isHistoryEncryptionNotice(event.data)) {
            handleHistoryEncryptionNotice?.(event.data);
            return;
        }
        if (event.data.type === 'repositoryUnavailable') {
            taskPanel.hidden = true;
            selectedTaskPanel.hidden = true;
            createTaskPanel.hidden = true;
            repositoryMessage.hidden = false;
            return;
        }

        handleExtensionMessage(event.data);
    });

    searchInput.addEventListener('input', renderTasks);
    assigneeFilterToggle.addEventListener('click', toggleAssigneeFilter);
    taskList.addEventListener('click', handleTaskListClick);
    tasksAccordionToggle.addEventListener('click', toggleTasksAccordion);
    quickReferenceToggle.addEventListener('click', toggleQuickReferenceAccordion);
    addTaskButton.addEventListener('click', showCreateTaskForm);
    reloadTasksButton.addEventListener('click', () => vscode.postMessage({ type: 'refreshTasks' }));
    descriptionToggle.addEventListener('click', toggleDescription);
    timeTrackingToggle.addEventListener('click', () => sendTaskAction('toggleTimeTracking'));
    taskStatusToggle.addEventListener('click', sendMarkTaskDone);
    createTaskForm.addEventListener('submit', handleCreateTaskSubmit);
    cancelCreateTask.addEventListener('click', closeCreateTaskForm);
    taskNameInput.addEventListener('input', clearFieldError);
    taskUrlInput.addEventListener('input', clearFieldError);
    taskDescriptionInput.addEventListener('input', clearFieldError);
    taskAssigneeInput.addEventListener('change', clearFieldError);
    addRelatedTaskButton?.addEventListener('click', () => addRelatedTaskRow(undefined, true));
    document.addEventListener('click', (event) => {
        if (!(event.target instanceof Element) || !event.target.closest('.more-menu-list')) {
            closeMoreMenus();
        }
    });
    vscode.postMessage({ type: 'ready' });
}

function handleExtensionMessage(message: Exclude<ExtensionToWebviewMessage, { type: 'repositoryUnavailable' } | HistoryEncryptionNotice>): void {
    if (message.type === 'taskSettings') {
        requireProjectManagementUrl = message.requireProjectManagementUrl;
        teamMembers = message.teamMembers;
        applyUrlRequirement();
        refreshAssigneeOptions();
        return;
    }
    if (message.type === 'relatedTaskCandidates') {
        relatedTaskCandidates = message.candidates;
        relatedTaskCandidatesLoaded = true;
        refreshRelatedTaskSelections();
        setRelatedTaskStatus(message.error ?? '');
        document.querySelectorAll<HTMLInputElement>('.related-task-input[aria-expanded="true"]')
            .forEach((input) => renderRelatedTaskOptions(input));
        return;
    }
    if (message.type === 'agentOutputs') {
        if (selectedTask?.id === message.taskId) {
            resetAgentOutputsForTask(message.taskId);
            agentOutputs = message.groups;
            if (agentOutputError) {
                agentOutputError.textContent = message.error ?? '';
                agentOutputError.hidden = !message.error;
            }
            renderAgentOutputs();
        }
        return;
    }
    if (message.type === 'todoStatusResult') {
        if (selectedTask?.id !== message.taskId) {
            return;
        }
        const previousChecked = pendingTodoChanges.get(message.itemId);
        pendingTodoChanges.delete(message.itemId);
        const checkbox = Array.from(document.querySelectorAll<HTMLInputElement>('.implementation-todo-checkbox'))
            .find((candidate) => candidate.dataset.todoId === message.itemId);
        if (checkbox) {
            checkbox.disabled = false;
            checkbox.checked = message.error ? previousChecked ?? !message.done : message.done;
        }
        if (agentOutputError) {
            agentOutputError.textContent = message.error ?? '';
            agentOutputError.hidden = !message.error;
        }
        return;
    }
    if (message.type === 'todoMutationResult') {
        if (selectedTask?.id !== message.taskId) {
            return;
        }
        if (!message.error) {
            todoEditorState = undefined;
            renderAgentOutputs(true);
        }
        document.querySelectorAll<HTMLButtonElement>('.implementation-todo-editor button').forEach((button) => {
            button.disabled = false;
        });
        if (agentOutputError) {
            agentOutputError.textContent = message.error ?? '';
            agentOutputError.hidden = !message.error;
        }
        return;
    }
    if (message.type === 'openEditForm') {
        showEditTaskForm(message.task);
        return;
    }
    if (message.type === 'createTaskValidationError') {
        setCreateTaskSubmitEnabled(true);
        showFieldErrors(message.errors);
        focusFirstInvalidField(message.errors);
        return;
    }
    if (message.type === 'createTaskFailed') {
        setCreateTaskSubmitEnabled(true);
        showCreateTaskError(`Could not create the task: ${message.message}`);
        return;
    }
    if (message.type === 'taskSaved') {
        closeCreateTaskForm();
        searchInput?.focus();
        return;
    }
    if (message.type === 'taskActionUpdated') {
        applyTaskActionUpdate(message.task);
        return;
    }
    if (message.type === 'taskActionFailed') {
        taskActionPending = false;
        setTaskActionButtonsEnabled(true);
        showTaskActionError(message.message);
        return;
    }
    if (message.type === 'taskActionCancelled') {
        taskActionPending = false;
        setTaskActionButtonsEnabled(true);
        return;
    }
    if (message.type === 'selectedTask') {
        if (!selectedTask || selectedTask.id === message.task.id) {
            selectedTask = message.task;
            renderSelectedTask();
        }
        return;
    }
    if (message.type === 'clearSelectedTask') {
        selectedTask = undefined;
        renderSelectedTask();
        return;
    }

    if (repositoryMessage) {
        repositoryMessage.hidden = true;
    }
    if (taskPanel) {
        taskPanel.hidden = false;
    }
    currentUser = message.currentUser;
    currentRepository = message.currentRepository;
    updateAssigneeFilterToggle();
    refreshAssigneeOptions();
    tasks = message.tasks;
    if (selectedTask) {
        const refreshedSelection = tasks.find((task) => task.id === selectedTask?.id);
        if (refreshedSelection) {
            selectedTask = refreshedSelection;
        } else if (selectedTask.status === 0) {
            selectedTask = undefined;
        }
    }
    renderTasks();
    renderSelectedTask();
}

function renderTasks(): void {
    if (!searchInput || !taskList || !emptyMessage) {
        return;
    }

    const query = searchInput.value.trim();
    const filteredTasks = filterTasks(tasks, query, filterByAssignee, currentUser);
    const rows = filteredTasks.map(createTaskRow);
    taskList.replaceChildren(...rows);
    emptyMessage.hidden = rows.length > 0;
    emptyMessage.textContent = getEmptyMessage(query);
}

function toggleAssigneeFilter(): void {
    filterByAssignee = !filterByAssignee;
    updateAssigneeFilterToggle();
    renderTasks();
}

function updateAssigneeFilterToggle(): void {
    if (!assigneeFilterToggle) {
        return;
    }
    assigneeFilterToggle.classList.toggle('is-active', filterByAssignee);
    assigneeFilterToggle.setAttribute('aria-pressed', String(filterByAssignee));
    assigneeFilterToggle.title = filterByAssignee
        ? 'Filter to tasks assigned to you'
        : 'Show tasks assigned to anyone';
    assigneeFilterToggle.setAttribute('aria-label', assigneeFilterToggle.title);
}

function getEmptyMessage(query: string): string {
    if (filterByAssignee && !currentUser) {
        return 'Set your email or turn off the assignee filter.';
    }
    if (query.trim() !== '') {
        return 'No matching tasks.';
    }
    return filterByAssignee ? 'No tasks assigned to you.' : 'No open tasks.';
}

/**
 * Rebuilds the assignee dropdown, keeping the current choice when it is still available.
 * `preferred` overrides the current choice (used when opening the create or edit form).
 */
function setAssigneeOptions(preferred?: string): void {
    if (!taskAssigneeInput) {
        return;
    }
    const selected = preferred ?? taskAssigneeInput.value;
    const options = buildAssigneeOptions(currentUser, teamMembers, [selected]);
    const placeholder = new Option('Select an assignee', '');
    placeholder.disabled = true;
    taskAssigneeInput.replaceChildren(placeholder, ...options.map((option) => new Option(option, option)));
    const selectedEmail = selected === '' ? undefined : getUserEmail(selected);
    taskAssigneeInput.value = options.find((option) => getUserEmail(option) === selectedEmail) ?? currentUser ?? '';
}

function refreshAssigneeOptions(): void {
    if (createTaskPanel?.hidden === false) {
        setAssigneeOptions();
    } else {
        setAssigneeOptions(currentUser ?? '');
    }
}

function createTaskRow(task: TaskSummary): HTMLLIElement {
    const row = document.createElement('li');
    row.className = 'task-row';

    const details = document.createElement('div');
    details.className = 'task-details';

    const name = document.createElement('span');
    name.className = 'task-name';
    name.textContent = task.name;

    const nameLine = document.createElement('span');
    nameLine.className = 'task-name-line';
    if (task.status === 1) {
        const statusIcon = document.createElement('span');
        statusIcon.className = 'in-progress-icon';
        statusIcon.title = 'In progress';
        statusIcon.setAttribute('aria-label', 'In progress');
        statusIcon.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/></svg>';
        nameLine.append(statusIcon);
    }
    nameLine.append(name);

    const createdOn = document.createElement('time');
    createdOn.className = 'task-date';
    createdOn.dateTime = task.createdOnDateTime;
    createdOn.textContent = formatDate(task.createdOnDateTime);

    const openButton = document.createElement('button');
    const selectButton = document.createElement('button');
    selectButton.className = 'task-select';
    selectButton.type = 'button';
    selectButton.dataset.taskId = task.id;
    selectButton.setAttribute('aria-pressed', String(selectedTask?.id === task.id));
    if (selectedTask?.id === task.id) {
        selectButton.setAttribute('aria-current', 'true');
    }

    openButton.className = 'task-action open-task-file';
    openButton.type = 'button';
    openButton.dataset.taskId = task.id;
    openButton.title = `Open ${task.name}`;
    openButton.setAttribute('aria-label', `Open ${task.name}`);
    openButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h9l5 5v13H5zM14 3v6h6M8 14h8M8 17h8"/></svg>';

    details.append(nameLine, createdOn);
    selectButton.append(details);
    const moreMenu = createMoreMenu('task-more', 'task-menu', `More actions for ${task.name}`, [
        { className: 'edit-task', icon: actionIcons.edit, label: 'Edit', run: () => vscode.postMessage({ type: 'editTask', taskId: task.id }) },
        { className: 'delete-task', icon: actionIcons.remove, label: 'Delete', run: () => vscode.postMessage({ type: 'deleteTask', taskId: task.id }) },
    ]);
    row.append(selectButton, openButton, moreMenu);
    return row;
}

function formatDate(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
        return '';
    }
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function handleTaskListClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }

    const button = target.closest<HTMLButtonElement>('button');
    const taskId = button?.dataset.taskId;
    if (!taskId) {
        return;
    }

    if (button.classList.contains('task-select')) {
        selectTask(taskId);
        return;
    }
    if (button.classList.contains('open-task-file')) {
        vscode.postMessage({ type: 'openTaskFile', taskId });
    }
}

function selectTask(taskId: string): void {
    selectedTask = tasks.find((task) => task.id === taskId);
    if (!selectedTask) {
        return;
    }
    renderTasks();
    renderSelectedTask();
    vscode.postMessage({ type: 'selectTask', taskId });
}

function renderSelectedTask(): void {
    if (!selectedTaskPanel || !selectedTaskName || !selectedTaskDescription || !descriptionToggle) {
        return;
    }

    selectedTaskPanel.hidden = !selectedTask;
    resetAgentOutputsForTask(selectedTask?.id);
    renderAgentOutputs();
    if (!selectedTask) {
        return;
    }

    selectedTaskName.textContent = selectedTask.name;
    selectedTaskName.title = selectedTask.name;
    selectedTaskDescription.textContent = selectedTask.description;
    renderSelectedTaskRelatedTasks(selectedTask);
    updateTaskActionButtons(selectedTask);
    selectedTaskDescription.classList.add('is-collapsed');
    descriptionToggle.hidden = true;
    descriptionToggle.textContent = 'Show more';
    descriptionToggle.setAttribute('aria-expanded', 'false');
    requestAnimationFrame(() => {
        if (!selectedTaskDescription.classList.contains('is-collapsed')) {
            return;
        }
        descriptionToggle.hidden = selectedTaskDescription.scrollHeight <= selectedTaskDescription.clientHeight + 1;
    });
}

/** Lists the selected task's related tasks; each opens the related task file. */
function renderSelectedTaskRelatedTasks(task: TaskSummary): void {
    if (!selectedTaskRelated || !selectedTaskRelatedList) {
        return;
    }
    const references = task.relatedTasks ?? [];
    selectedTaskRelated.hidden = references.length === 0;
    selectedTaskRelatedList.replaceChildren(...references.map((reference) => {
        const item = document.createElement('li');
        item.className = 'selected-task-related-item';
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'selected-task-related-link';
        link.textContent = reference.taskName || reference.taskId;
        link.title = `Open "${reference.taskName || reference.taskId}"`;
        link.addEventListener('click', () => vscode.postMessage({ type: 'openRelatedTask', taskId: task.id, reference }));
        item.append(link);
        if (reference.repositoryName) {
            const repository = document.createElement('span');
            repository.className = 'related-task-repository-tag selected-task-related-repository';
            repository.textContent = reference.repositoryName;
            item.append(repository);
        }
        return item;
    }));
}

function resetAgentOutputsForTask(taskId: string | undefined): void {
    if (outputTaskId === taskId) {
        return;
    }
    outputTaskId = taskId;
    agentOutputs = [];
    expandedOutputAgents.clear();
    selectedOutputFiles.clear();
    pendingTodoChanges.clear();
    todoEditorState = undefined;
    if (agentOutputError) {
        agentOutputError.hidden = true;
        agentOutputError.textContent = '';
    }
}

function renderAgentOutputs(force = false): void {
    if (!agentOutputsPanel) {
        return;
    }
    const counter = agentOutputsPanel.querySelector<HTMLElement>('.implementation-todo-counter');
    if (counter) {
        counter.textContent = formatTodoCounter(agentOutputs.find((group) => group.id === 'implement'));
    }
    if (!force && todoEditorState && agentOutputsPanel.querySelector('.implementation-todo-editor')) {
        return;
    }
    const groups = outputAgents.map((agent) => agentOutputs.find((group) => group.id === agent.id)
        ?? { id: agent.id, name: agent.name, files: [] });
    agentOutputsPanel.replaceChildren(...groups.map(createAgentOutputAccordion));
}

function createAgentOutputAccordion(group: AgentOutputGroup): HTMLElement {
    const section = document.createElement('section');
    section.className = 'agent-output-accordion';
    const header = document.createElement('header');
    header.className = 'agent-output-header';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'agent-output-toggle';
    toggle.disabled = group.files.length === 0 && group.id !== 'implement';
    toggle.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"/></svg>';
    const title = document.createElement('span');
    title.textContent = group.name;
    toggle.append(title);
    if (group.id === 'implement') {
        const counter = document.createElement('span');
        counter.className = 'implementation-todo-counter';
        counter.textContent = formatTodoCounter(group);
        counter.title = 'Completed / total TODOs';
        toggle.append(counter);
    }
    const content = document.createElement('div');
    content.id = `agent-output-${group.id}`;
    content.className = 'agent-output-content';
    toggle.setAttribute('aria-controls', content.id);
    const expanded = !toggle.disabled && expandedOutputAgents.has(group.id);
    toggle.setAttribute('aria-expanded', String(expanded));
    content.hidden = !expanded;
    toggle.addEventListener('click', () => {
        const nextExpanded = content.hidden;
        content.hidden = !nextExpanded;
        toggle.setAttribute('aria-expanded', String(nextExpanded));
        if (nextExpanded) {
            expandedOutputAgents.add(group.id);
        } else {
            expandedOutputAgents.delete(group.id);
        }
    });
    if (isListOutputAgent(group.id)) {
        content.append(createAgentOutputList(group));
        header.append(toggle);
        section.append(header, content);
        return section;
    }

    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'agent-output-view task-action';
    viewButton.innerHTML = actionIcons.view;
    viewButton.title = `Preview ${group.name} Markdown`;
    viewButton.setAttribute('aria-label', viewButton.title);
    viewButton.disabled = group.files.length === 0;
    viewButton.hidden = group.files.length === 0;
    const selectedFile = group.files.find((file) => file.fileName === selectedOutputFiles.get(group.id)) ?? group.files[0];
    if (selectedFile) {
        selectedOutputFiles.set(group.id, selectedFile.fileName);
    }
    viewButton.addEventListener('click', () => {
        const fileName = selectedOutputFiles.get(group.id);
        if (selectedTask && fileName) {
            vscode.postMessage({ type: 'viewAgentOutput', taskId: selectedTask.id, fileName });
        }
    });
    const summary = document.createElement('p');
    summary.className = 'agent-output-summary';
    summary.textContent = selectedFile?.summary || 'No summary available.';
    const addTodoButton = document.createElement('button');
    addTodoButton.type = 'button';
    addTodoButton.className = 'agent-output-add accordion-icon-button';
    addTodoButton.innerHTML = actionIcons.add;
    addTodoButton.title = 'Add a user-owned TODO';
    addTodoButton.setAttribute('aria-label', addTodoButton.title);
    addTodoButton.hidden = group.id !== 'implement';
    addTodoButton.addEventListener('click', () => {
        showTodoEditor(undefined, 'Notes');
    });
    if (group.id === 'implement') {
        if (group.error) {
            const error = document.createElement('p');
            error.className = 'agent-output-inline-error';
            error.textContent = group.error;
            content.append(error);
        }
        for (const todoGroup of group.todoGroups ?? []) {
            const groupHeading = document.createElement('h3');
            groupHeading.className = 'implementation-todo-group-heading';
            groupHeading.textContent = todoGroup.name;
            const items = document.createElement('ul');
            items.className = 'implementation-todo-list';
            items.dataset.todoGroup = todoGroup.name;
            for (const item of todoGroup.items) {
                items.append(createImplementationTodoItem(item, todoGroup.name, group.todoGroups ?? []));
            }
            items.addEventListener('dragover', (event) => {
                if (!draggedTodoItemId) {
                    return;
                }
                event.preventDefault();
                items.classList.add('is-drop-target');
            });
            items.addEventListener('dragleave', (event) => {
                if (!items.contains(event.relatedTarget as Node | null)) {
                    items.classList.remove('is-drop-target');
                }
            });
            items.addEventListener('drop', (event) => {
                event.preventDefault();
                items.classList.remove('is-drop-target');
                if (draggedTodoItemId) {
                    reorderTodoItem(draggedTodoItemId, todoGroup.name, undefined, false);
                }
            });
            content.append(groupHeading, items);
        }
    }
    if (group.files.length > 1) {
        const label = document.createElement('label');
        const selector = document.createElement('select');
        selector.id = `agent-output-file-${group.id}`;
        label.htmlFor = selector.id;
        label.className = 'visually-hidden';
        label.textContent = `${group.name} output file`;
        selector.className = 'agent-output-file';
        group.files.forEach((file) => {
            const option = document.createElement('option');
            option.value = file.fileName;
            option.textContent = file.fileName;
            selector.append(option);
        });
        selector.value = selectedFile?.fileName ?? '';
        selector.addEventListener('change', () => {
            selectedOutputFiles.set(group.id, selector.value);
            summary.textContent = group.files.find((file) => file.fileName === selector.value)?.summary || 'No summary available.';
        });
        content.append(label, selector);
    }
    header.append(toggle);
    if (group.id === 'implement') {
        header.append(addTodoButton);
    }
    header.append(viewButton);
    if (group.id !== 'implement') {
        content.prepend(summary);
    }
    if (group.id === 'implement' && todoEditorState && todoEditorState.taskId === selectedTask?.id) {
        const editingItem = group.todoGroups?.flatMap((todoGroup) => todoGroup.items)
            .find((item) => item.id === todoEditorState?.itemId);
        content.replaceChildren(createTodoEditor(editingItem, todoEditorState.groupName));
        content.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        addTodoButton.hidden = true;
    }
    section.append(header, content);
    return section;
}

function createAgentOutputList(group: AgentOutputGroup): HTMLUListElement {
    const list = document.createElement('ul');
    list.className = 'agent-output-list';
    list.append(...group.files.map((file) => createAgentOutputRow(file)));
    return list;
}

function createAgentOutputRow(file: AgentOutputFile): HTMLLIElement {
    const row = document.createElement('li');
    row.className = 'agent-output-row';
    row.dataset.fileName = file.fileName;
    const summary = document.createElement('p');
    summary.className = 'agent-output-row-summary';
    summary.textContent = file.summary || 'No summary available.';
    summary.title = summary.textContent;
    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'agent-output-view agent-output-row-view task-action';
    viewButton.innerHTML = actionIcons.view;
    viewButton.title = `Preview ${file.fileName}`;
    viewButton.setAttribute('aria-label', viewButton.title);
    viewButton.addEventListener('click', () => {
        if (selectedTask) {
            vscode.postMessage({ type: 'viewAgentOutput', taskId: selectedTask.id, fileName: file.fileName });
        }
    });
    row.append(summary, viewButton);
    return row;
}

function formatTodoCounter(group: AgentOutputGroup | undefined): string {
    const items = group?.todoGroups?.flatMap((todoGroup) => todoGroup.items) ?? [];
    return `${items.filter((item) => item.done).length}/${items.length}`;
}

function createImplementationTodoItem(
    item: ImplementationTodoItem,
    groupName: string,
    groups: NonNullable<AgentOutputGroup['todoGroups']>,
): HTMLLIElement {
    const row = document.createElement('li');
    row.className = 'implementation-todo-item';
    row.dataset.todoId = item.id;
    row.draggable = true;
    row.addEventListener('dragstart', (event) => {
        draggedTodoItemId = item.id;
        row.classList.add('is-dragging');
        event.dataTransfer?.setData('text/plain', item.id);
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
        }
    });
    row.addEventListener('dragend', () => {
        draggedTodoItemId = undefined;
        row.classList.remove('is-dragging');
        document.querySelectorAll('.is-drop-target').forEach((element) => element.classList.remove('is-drop-target'));
    });
    row.addEventListener('dragover', (event) => {
        if (draggedTodoItemId && draggedTodoItemId !== item.id) {
            event.preventDefault();
            row.classList.add('is-drop-target');
        }
    });
    row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
    row.addEventListener('drop', (event) => {
        if (!draggedTodoItemId || draggedTodoItemId === item.id) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const bounds = row.getBoundingClientRect();
        const after = event.clientY > bounds.top + bounds.height / 2;
        reorderTodoItem(draggedTodoItemId, groupName, item.id, after);
        row.classList.remove('is-drop-target');
    });
    const label = document.createElement('label');
    label.className = 'implementation-todo-label';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'implementation-todo-checkbox';
    checkbox.dataset.todoId = item.id;
    checkbox.checked = item.done;
    checkbox.disabled = pendingTodoChanges.has(item.id);
    checkbox.setAttribute('aria-label', `${item.done ? 'Reopen' : 'Complete'} ${item.title}`);
    checkbox.addEventListener('change', () => {
        if (!selectedTask) {
            checkbox.checked = !checkbox.checked;
            return;
        }
        pendingTodoChanges.set(item.id, !checkbox.checked);
        checkbox.disabled = true;
        vscode.postMessage({ type: 'setTodoStatus', taskId: selectedTask.id, itemId: item.id, done: checkbox.checked });
    });
    const title = document.createElement('span');
    title.className = 'implementation-todo-title';
    title.textContent = item.title;
    title.title = item.title;
    label.append(checkbox, title);
    row.append(label);
    if (item.alert) {
        const alert = document.createElement('p');
        alert.className = 'implementation-todo-alert';
        alert.textContent = `Alert: ${item.alert}`;
        row.append(alert);
    }
    const actions = document.createElement('div');
    actions.className = 'implementation-todo-actions';
    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'implementation-todo-view task-action';
    viewButton.innerHTML = actionIcons.view;
    viewButton.title = `View ${item.title}`;
    viewButton.setAttribute('aria-label', viewButton.title);
    viewButton.addEventListener('click', () => {
        if (selectedTask) {
            vscode.postMessage({ type: 'viewTodo', taskId: selectedTask.id, itemId: item.id });
        }
    });
    actions.append(viewButton, createTodoMoreMenu(item, groupName));
    row.append(actions);
    return row;
}

interface MoreMenuAction {
    className: string;
    icon: string;
    label: string;
    run: () => void;
}

/** Builds the TODO "More actions" dropdown with Edit, Create task and Delete. */
function createTodoMoreMenu(item: ImplementationTodoItem, groupName: string): HTMLElement {
    return createMoreMenu('implementation-todo-more', 'implementation-todo-menu', `More actions for ${item.title}`, [
        { className: 'implementation-todo-edit', icon: actionIcons.edit, label: 'Edit', run: () => showTodoEditor(item, groupName) },
        { className: 'implementation-todo-create-task', icon: actionIcons.createTask, label: 'Create task', run: () => showCreateTaskFromTodo(item) },
        {
            className: 'implementation-todo-remove', icon: actionIcons.remove, label: 'Delete', run: () => {
                if (selectedTask) {
                    vscode.postMessage({ type: 'removeTodo', taskId: selectedTask.id, itemId: item.id });
                }
            },
        },
    ]);
}

/**
 * Builds a "More actions" (vertical dots) button with a dropdown menu, wrapped in a positioning container.
 * The extra class names let callers target their own button and menu.
 */
function createMoreMenu(buttonClass: string, menuClass: string, ariaLabel: string, actions: MoreMenuAction[]): HTMLElement {
    const container = document.createElement('div');
    container.className = 'more-menu';

    const moreButton = document.createElement('button');
    moreButton.type = 'button';
    moreButton.className = `more-menu-button task-action ${buttonClass}`;
    moreButton.innerHTML = actionIcons.more;
    moreButton.title = 'More Actions...';
    moreButton.setAttribute('aria-label', ariaLabel);
    moreButton.setAttribute('aria-haspopup', 'menu');
    moreButton.setAttribute('aria-expanded', 'false');

    const menu = document.createElement('div');
    menu.className = `more-menu-list ${menuClass}`;
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    menu.append(...actions.map((action) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `more-menu-item ${action.className}`;
        button.setAttribute('role', 'menuitem');
        button.tabIndex = -1;
        button.innerHTML = action.icon;
        const text = document.createElement('span');
        text.textContent = action.label;
        button.append(text);
        button.addEventListener('click', () => {
            closeMoreMenus();
            action.run();
        });
        return button;
    }));

    moreButton.addEventListener('click', (event) => {
        event.stopPropagation();
        const wasOpen = !menu.hidden;
        closeMoreMenus();
        if (!wasOpen) {
            menu.hidden = false;
            moreButton.setAttribute('aria-expanded', 'true');
            menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
        }
    });
    menu.addEventListener('keydown', (event) => {
        const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'Escape') {
            event.preventDefault();
            closeMoreMenus();
            moreButton.focus();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            items[(index + step + items.length) % items.length]?.focus();
        } else if (event.key === 'Tab') {
            closeMoreMenus();
        }
    });
    container.append(moreButton, menu);
    return container;
}

function closeMoreMenus(): void {
    document.querySelectorAll<HTMLElement>('.more-menu-list').forEach((menu) => {
        menu.hidden = true;
    });
    document.querySelectorAll<HTMLButtonElement>('.more-menu-button').forEach((button) => {
        button.setAttribute('aria-expanded', 'false');
    });
}

function showTodoEditor(item: ImplementationTodoItem | undefined, groupName: string): void {
    if (!selectedTask) {
        return;
    }
    todoEditorState = { taskId: selectedTask.id, itemId: item?.id, groupName };
    expandedOutputAgents.add('implement');
    renderAgentOutputs(true);
    document.querySelector<HTMLInputElement>('.implementation-todo-editor [name="title"]')?.focus();
}

function createTodoEditor(item: ImplementationTodoItem | undefined, groupName: string): HTMLFormElement {
    const form = document.createElement('form');
    form.className = 'implementation-todo-editor';
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const title = getFormValue(formData, 'title').trim();
        const group = getFormValue(formData, 'group').trim();
        if (!selectedTask || title === '' || group === '') {
            return;
        }
        const changes: Partial<ImplementationTodoItemDraft> = {
            title,
            source: item?.source ?? 'user-note',
            sourceRef: item?.sourceRef ?? '',
            why: getFormValue(formData, 'why'),
            files: getFormValue(formData, 'files').split('\n').map((file) => file.trim()).filter(Boolean),
            decisions: getFormValue(formData, 'decisions'),
            acceptance: getFormValue(formData, 'acceptance'),
            evidence: getFormValue(formData, 'evidence'),
            remaining: getFormValue(formData, 'remaining'),
            alert: getFormValue(formData, 'alert').trim() || null,
        };
        if (item) {
            vscode.postMessage({ type: 'updateTodo', taskId: selectedTask.id, itemId: item.id, group, changes });
        } else {
            vscode.postMessage({
                type: 'createTodo', taskId: selectedTask.id, group, item: {
                    ...changes,
                    done: false,
                    source: 'user-note',
                    sourceRef: '',
                    why: changes.why ?? '',
                    files: changes.files ?? [],
                    decisions: changes.decisions ?? '',
                    acceptance: changes.acceptance ?? '',
                    evidence: changes.evidence ?? '',
                    remaining: changes.remaining ?? '',
                    alert: changes.alert ?? null,
                } as ImplementationTodoItemDraft
            });
        }
        form.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
            button.disabled = true;
        });
    });
    const title = appendTodoField(form, 'title', 'Title', item?.title ?? '', 'text');
    title.required = true;
    const group = appendTodoField(form, 'group', 'Group', groupName, 'text');
    group.required = true;
    appendTodoField(form, 'why', 'Why', item?.why ?? '', 'textarea');
    appendTodoField(form, 'files', 'Files (one path per line)', item?.files.join('\n') ?? '', 'textarea');
    appendTodoField(form, 'decisions', 'Decisions and constraints', item?.decisions ?? '', 'textarea');
    appendTodoField(form, 'acceptance', 'Acceptance criteria', item?.acceptance ?? '', 'textarea');
    appendTodoField(form, 'evidence', 'Evidence', item?.evidence ?? '', 'textarea');
    appendTodoField(form, 'remaining', 'Remaining work', item?.remaining ?? '', 'textarea');
    appendTodoField(form, 'alert', 'Alert', item?.alert ?? '', 'textarea');
    const buttons = document.createElement('div');
    buttons.className = 'form-actions';
    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = 'Save';
    save.className = 'primary-button';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.className = 'secondary-button';
    cancel.addEventListener('click', () => {
        todoEditorState = undefined;
        renderAgentOutputs(true);
    });
    buttons.append(cancel, save);
    form.append(buttons);
    return form;
}

function appendTodoField(
    form: HTMLFormElement,
    name: string,
    labelText: string,
    value: string,
    kind: 'text' | 'textarea',
): HTMLInputElement | HTMLTextAreaElement {
    const control = kind === 'text' ? document.createElement('input') : document.createElement('textarea');
    control.name = name;
    control.value = value;
    if (control instanceof HTMLTextAreaElement) {
        control.rows = 4;
    }
    if (control instanceof HTMLInputElement) {
        control.type = 'text';
    }
    appendTodoControl(form, labelText, control);
    return control;
}

function appendTodoControl(form: HTMLFormElement, labelText: string, control: HTMLElement): void {
    const label = document.createElement('label');
    label.className = 'form-field implementation-todo-field';
    const text = document.createElement('span');
    text.textContent = labelText;
    label.append(text, control);
    form.append(label);
}

function getFormValue(data: FormData, key: string): string {
    const value = data.get(key);
    return typeof value === 'string' ? value : '';
}

function reorderTodoItem(sourceId: string, targetGroupName: string, targetId: string | undefined, after: boolean): void {
    if (!selectedTask || sourceId === targetId) {
        return;
    }
    const group = agentOutputs.find((candidate) => candidate.id === 'implement');
    const groups = (group?.todoGroups ?? []).map((candidate) => ({
        name: candidate.name,
        itemIds: candidate.items.map((item) => item.id),
    }));
    const sourceGroup = groups.find((candidate) => candidate.itemIds.includes(sourceId));
    const targetGroup = groups.find((candidate) => candidate.name === targetGroupName);
    if (!sourceGroup || !targetGroup) {
        return;
    }
    sourceGroup.itemIds = sourceGroup.itemIds.filter((id) => id !== sourceId);
    const targetIndex = targetId ? targetGroup.itemIds.indexOf(targetId) : targetGroup.itemIds.length;
    if (targetId && targetIndex < 0) {
        return;
    }
    targetGroup.itemIds.splice(targetIndex + (after && targetId ? 1 : 0), 0, sourceId);
    vscode.postMessage({ type: 'reorderTodos', taskId: selectedTask.id, groups });
}

function updateTaskActionButtons(task: TaskSummary): void {
    if (!timeTrackingToggle || !taskStatusToggle) {
        return;
    }
    const lastEntry = task.timeTracking.at(-1);
    const isTracking = lastEntry?.endDateTime === null;
    timeTrackingToggle.classList.toggle('is-paused', isTracking);
    timeTrackingToggle.classList.toggle('is-playing', !isTracking);
    timeTrackingToggle.title = isTracking ? 'Pause time tracking' : 'Start time tracking';
    timeTrackingToggle.setAttribute('aria-label', timeTrackingToggle.title);
    timeTrackingToggle.innerHTML = isTracking
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h3v14H8zM15 5h3v14h-3z"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 4 13 8-13 8z"/></svg>';

    const isDone = task.status === 2;
    taskStatusToggle.hidden = isDone;
    taskStatusToggle.classList.add('is-completion');
    taskStatusToggle.title = 'Mark task done';
    taskStatusToggle.setAttribute('aria-label', taskStatusToggle.title);
    taskStatusToggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"/></svg>';
}

function sendTaskAction(type: 'toggleTimeTracking'): void {
    if (!selectedTask || taskActionPending) {
        return;
    }
    taskActionPending = true;
    setTaskActionButtonsEnabled(false);
    showTaskActionError('');
    vscode.postMessage({ type, taskId: selectedTask.id });
}

function sendMarkTaskDone(): void {
    if (!selectedTask || selectedTask.status === 2 || taskActionPending) {
        return;
    }
    taskActionPending = true;
    setTaskActionButtonsEnabled(false);
    showTaskActionError('');
    vscode.postMessage({ type: 'markTaskDone', taskId: selectedTask.id });
}

function applyTaskActionUpdate(task: TaskSummary): void {
    selectedTask = task;
    taskActionPending = false;
    setTaskActionButtonsEnabled(true);
    showTaskActionError('');
    if (task.status === 0) {
        tasks = tasks.map((candidate) => candidate.id === task.id ? task : candidate);
    } else {
        tasks = tasks.filter((candidate) => candidate.id !== task.id);
    }
    renderTasks();
    renderSelectedTask();
}

function setTaskActionButtonsEnabled(enabled: boolean): void {
    if (!timeTrackingToggle || !taskStatusToggle) {
        return;
    }
    timeTrackingToggle.disabled = !enabled;
    taskStatusToggle.disabled = !enabled;
}

function showTaskActionError(message: string): void {
    if (!taskActionError) {
        return;
    }
    taskActionError.textContent = message;
    taskActionError.hidden = message === '';
}

function toggleTasksAccordion(): void {
    if (!tasksAccordionToggle) {
        return;
    }
    setTasksAccordionExpanded(tasksAccordionToggle.getAttribute('aria-expanded') !== 'true');
}

function setTasksAccordionExpanded(expanded: boolean): void {
    if (!tasksAccordionToggle || !tasksAccordionContent) {
        return;
    }
    tasksAccordionToggle.setAttribute('aria-expanded', String(expanded));
    tasksAccordionContent.hidden = !expanded;
}

function toggleQuickReferenceAccordion(): void {
    if (!quickReferenceToggle || !quickReferenceContent) {
        return;
    }
    const expanded = quickReferenceToggle.getAttribute('aria-expanded') !== 'true';
    quickReferenceToggle.setAttribute('aria-expanded', String(expanded));
    quickReferenceContent.hidden = !expanded;
}

function toggleDescription(): void {
    if (!selectedTaskDescription || !descriptionToggle) {
        return;
    }
    const isExpanded = selectedTaskDescription.classList.toggle('is-expanded');
    selectedTaskDescription.classList.toggle('is-collapsed', !isExpanded);
    descriptionToggle.textContent = isExpanded ? 'Show less' : 'Show more';
    descriptionToggle.setAttribute('aria-expanded', String(isExpanded));
}

function applyUrlRequirement(): void {
    const marker = document.querySelector<HTMLElement>('#task-url-required');
    if (marker) {
        marker.hidden = !requireProjectManagementUrl;
    }
    taskUrlInput?.toggleAttribute('required', requireProjectManagementUrl);
}

function handleCreateTaskSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const input = readCreateTaskInput();
    const errors = validateTaskInput(input, { requireProjectManagementUrl });
    showFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
        focusFirstInvalidField(errors);
        return;
    }

    showCreateTaskError('');
    setCreateTaskSubmitEnabled(false);
    if (editingTaskId) {
        vscode.postMessage({ type: 'saveTask', taskId: editingTaskId, input });
        return;
    }
    vscode.postMessage(taskSourceTodo ? { type: 'saveTask', input, sourceTodo: taskSourceTodo } : { type: 'saveTask', input });
}

function readCreateTaskInput(): CreateTaskInput {
    return {
        name: taskNameInput?.value ?? '',
        projectManagementUrl: taskUrlInput?.value ?? '',
        description: taskDescriptionInput?.value ?? '',
        assignee: taskAssigneeInput?.value ?? '',
        relatedTasks: readRelatedTaskRows(),
    };
}

function showFieldErrors(errors: TaskFieldErrors): void {
    setFieldError('name', errors.name);
    setFieldError('projectManagementUrl', errors.projectManagementUrl);
    setFieldError('description', errors.description);
    setFieldError('assignee', errors.assignee);
    setFieldError('relatedTasks', errors.relatedTasks);
}

function clearFieldError(event: Event): void {
    const field = event.currentTarget;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) {
        return;
    }
    if (field.name === 'name' || field.name === 'projectManagementUrl' || field.name === 'description' || field.name === 'assignee') {
        setFieldError(field.name, undefined);
    }
}

function setFieldError(field: keyof CreateTaskInput, message: string | undefined): void {
    const errorElement = document.getElementById(fieldErrorIds[field]);
    const inputElement = document.getElementById(fieldInputIds[field]);
    if (!errorElement || !inputElement) {
        return;
    }
    errorElement.textContent = message ?? '';
    errorElement.hidden = !message;
    inputElement.setAttribute('aria-invalid', String(Boolean(message)));
}

function focusFirstInvalidField(errors: TaskFieldErrors): void {
    const firstInvalidField = Object.keys(errors)[0] as keyof CreateTaskInput | undefined;
    if (!firstInvalidField) {
        return;
    }
    document.getElementById(fieldInputIds[firstInvalidField])?.focus();
}

function showCreateTaskForm(): void {
    if (!createTaskPanel || !taskListPanel || !taskNameInput || !taskFormHeading || !createTaskError) {
        return;
    }
    editingTaskId = undefined;
    taskSourceTodo = undefined;
    createTaskForm?.reset();
    setAssigneeOptions(currentUser ?? '');
    resetRelatedTaskRows([]);
    clearAllFieldErrors();
    taskFormHeading.textContent = 'New task';
    createTaskPanel.hidden = false;
    taskListPanel.hidden = true;
    showCreateTaskError('');
    taskNameInput.focus();
}

/** Opens the "New task" form pre-filled from a TODO of the selected task. */
function showCreateTaskFromTodo(item: ImplementationTodoItem): void {
    const parentTask = selectedTask;
    if (!parentTask || !taskNameInput || !taskUrlInput || !taskDescriptionInput) {
        return;
    }
    showCreateTaskForm();
    taskSourceTodo = { taskId: parentTask.id, itemId: item.id };
    taskNameInput.value = item.title;
    taskUrlInput.value = parentTask.projectManagementUrl;
    taskDescriptionInput.value = formatTodoAsTaskDescription(item);
    setAssigneeOptions(parentTask.assignee ?? currentUser ?? '');
    if (currentRepository) {
        addRelatedTaskRow({
            taskId: parentTask.id,
            taskName: parentTask.name,
            repositoryName: currentRepository.name,
            repositoryPath: currentRepository.path,
            repositoryUrl: currentRepository.originUrl,
        }, false);
    }
    createTaskPanel?.scrollIntoView?.({ block: 'nearest' });
}

function formatTodoAsTaskDescription(item: ImplementationTodoItem): string {
    return [`- Status: ${item.done ? 'Done' : 'Open'}`, ...describeImplementationTodoItem(item)].join('\n');
}

function showEditTaskForm(task: TaskSummary): void {
    if (!createTaskPanel || !taskListPanel || !taskNameInput || !taskUrlInput || !taskDescriptionInput || !taskFormHeading) {
        return;
    }
    editingTaskId = task.id;
    taskSourceTodo = undefined;
    taskFormHeading.textContent = 'Edit task';
    taskNameInput.value = task.name;
    taskUrlInput.value = task.projectManagementUrl;
    taskDescriptionInput.value = task.description;
    setAssigneeOptions(task.assignee ?? currentUser ?? '');
    resetRelatedTaskRows(task.relatedTasks ?? []);
    clearAllFieldErrors();
    showCreateTaskError('');
    createTaskPanel.hidden = false;
    taskListPanel.hidden = true;
    taskNameInput.focus();
}

function closeCreateTaskForm(): void {
    editingTaskId = undefined;
    taskSourceTodo = undefined;
    createTaskForm?.reset();
    clearRelatedTaskRows();
    createTaskPanel?.setAttribute('hidden', '');
    if (taskListPanel) {
        taskListPanel.hidden = false;
    }
    clearAllFieldErrors();
    showCreateTaskError('');
    if (taskFormHeading) {
        taskFormHeading.textContent = 'New task';
    }
    setCreateTaskSubmitEnabled(true);
    searchInput?.focus();
}

function clearAllFieldErrors(): void {
    setFieldError('name', undefined);
    setFieldError('projectManagementUrl', undefined);
    setFieldError('description', undefined);
    setFieldError('assignee', undefined);
    setFieldError('relatedTasks', undefined);
}

function showCreateTaskError(message: string): void {
    if (!createTaskError) {
        return;
    }
    createTaskError.textContent = message;
    createTaskError.hidden = message === '';
}

function setCreateTaskSubmitEnabled(enabled: boolean): void {
    if (createTaskSubmit) {
        createTaskSubmit.disabled = !enabled;
    }
}

/** Replaces the related-task rows with the given links and reloads the linkable tasks. */
function resetRelatedTaskRows(references: readonly RelatedTaskReference[]): void {
    clearRelatedTaskRows();
    references.forEach((reference) => addRelatedTaskRow(reference, false));
    relatedTaskCandidatesLoaded = false;
    setRelatedTaskStatus('');
    vscode.postMessage({ type: 'loadRelatedTaskCandidates' });
}

function clearRelatedTaskRows(): void {
    relatedTaskList?.replaceChildren();
}

/**
 * Adds a related-task row: a combobox that searches linkable tasks by name and lists each match
 * with its repository name, plus a remove button.
 */
function addRelatedTaskRow(reference: RelatedTaskReference | undefined, focus: boolean): void {
    if (!relatedTaskList) {
        return;
    }
    relatedTaskRowCount += 1;
    const listboxId = `task-related-options-${relatedTaskRowCount}`;
    const row = document.createElement('li');
    row.className = 'related-task-row';

    const combobox = document.createElement('div');
    combobox.className = 'related-task-combobox';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'related-task-input';
    input.autocomplete = 'off';
    input.placeholder = 'Search tasks by name';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-label', 'Related task');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', listboxId);
    const repositoryTag = document.createElement('span');
    repositoryTag.className = 'related-task-repository-tag';
    repositoryTag.hidden = true;
    const listbox = document.createElement('ul');
    listbox.id = listboxId;
    listbox.className = 'related-task-options';
    listbox.setAttribute('role', 'listbox');
    listbox.setAttribute('aria-label', 'Matching tasks');
    listbox.hidden = true;
    // Keep focus in the input while an option is clicked, so blur does not close the list first.
    listbox.addEventListener('mousedown', (event) => event.preventDefault());
    combobox.append(input, repositoryTag, listbox);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'related-task-remove';
    removeButton.title = 'Remove related task';
    removeButton.setAttribute('aria-label', 'Remove related task');
    removeButton.innerHTML = actionIcons.remove;
    removeButton.addEventListener('click', () => {
        row.remove();
        setFieldError('relatedTasks', undefined);
        addRelatedTaskButton?.focus();
    });

    row.append(combobox, removeButton);
    relatedTaskList.append(row);
    if (reference) {
        selectRelatedTask(row, reference);
    }

    input.addEventListener('input', () => {
        const selection = relatedTaskSelections.get(row);
        if (selection && input.value !== selection.taskName) {
            relatedTaskSelections.delete(row);
            updateRelatedTaskTag(row);
        }
        setFieldError('relatedTasks', undefined);
        openRelatedTaskOptions(input);
    });
    input.addEventListener('focus', () => openRelatedTaskOptions(input));
    input.addEventListener('blur', () => closeRelatedTaskOptions(input));
    input.addEventListener('keydown', (event) => handleRelatedTaskKeydown(event, row, input));
    if (focus) {
        input.focus();
    }
}

function handleRelatedTaskKeydown(event: KeyboardEvent, row: HTMLLIElement, input: HTMLInputElement): void {
    const listbox = getRelatedTaskListbox(input);
    if (!listbox) {
        return;
    }
    const options = Array.from(listbox.querySelectorAll<HTMLLIElement>('[role="option"]'));
    const activeIndex = options.findIndex((option) => option.getAttribute('aria-selected') === 'true');
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (listbox.hidden) {
            openRelatedTaskOptions(input);
            return;
        }
        if (options.length === 0) {
            return;
        }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = activeIndex < 0
            ? (step === 1 ? 0 : options.length - 1)
            : (activeIndex + step + options.length) % options.length;
        setActiveRelatedTaskOption(input, options, nextIndex);
        return;
    }
    if (event.key === 'Enter' && !listbox.hidden) {
        // Enter picks the highlighted match instead of submitting the form.
        event.preventDefault();
        const candidate = activeIndex >= 0 ? getMatchingRelatedTasks(row, input.value)[activeIndex] : undefined;
        if (candidate) {
            selectRelatedTask(row, candidate);
            closeRelatedTaskOptions(input);
        }
        return;
    }
    if (event.key === 'Escape' && !listbox.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closeRelatedTaskOptions(input);
    }
}

function setActiveRelatedTaskOption(input: HTMLInputElement, options: HTMLLIElement[], index: number): void {
    options.forEach((option, optionIndex) => option.setAttribute('aria-selected', String(optionIndex === index)));
    const active = options[index];
    if (active) {
        input.setAttribute('aria-activedescendant', active.id);
        active.scrollIntoView?.({ block: 'nearest' });
    } else {
        input.removeAttribute('aria-activedescendant');
    }
}

function openRelatedTaskOptions(input: HTMLInputElement): void {
    const listbox = getRelatedTaskListbox(input);
    if (!listbox) {
        return;
    }
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    renderRelatedTaskOptions(input);
}

function closeRelatedTaskOptions(input: HTMLInputElement): void {
    const listbox = getRelatedTaskListbox(input);
    if (listbox) {
        listbox.hidden = true;
    }
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
}

/** Lists every linkable task whose name contains the typed text, each with its repository name. */
function renderRelatedTaskOptions(input: HTMLInputElement): void {
    const row = input.closest<HTMLLIElement>('.related-task-row');
    const listbox = getRelatedTaskListbox(input);
    if (!row || !listbox) {
        return;
    }
    input.removeAttribute('aria-activedescendant');
    if (!relatedTaskCandidatesLoaded) {
        listbox.replaceChildren(createRelatedTaskMessage('Loading tasks…'));
        return;
    }
    const matches = getMatchingRelatedTasks(row, input.value);
    if (matches.length === 0) {
        listbox.replaceChildren(createRelatedTaskMessage('No matching tasks.'));
        return;
    }
    listbox.replaceChildren(...matches.map((candidate, index) => {
        const option = document.createElement('li');
        option.id = `${listbox.id}-${index}`;
        option.className = 'related-task-option';
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        const name = document.createElement('span');
        name.className = 'related-task-option-name';
        name.textContent = candidate.taskName;
        const repository = document.createElement('span');
        repository.className = 'related-task-option-repository';
        repository.textContent = candidate.status === 2 ? `${candidate.repositoryName} · Done` : candidate.repositoryName;
        option.append(name, repository);
        option.addEventListener('click', () => {
            selectRelatedTask(row, candidate);
            closeRelatedTaskOptions(input);
        });
        return option;
    }));
}

function createRelatedTaskMessage(text: string): HTMLLIElement {
    const message = document.createElement('li');
    message.className = 'related-task-options-message';
    message.textContent = text;
    return message;
}

/**
 * Returns the candidates whose name contains the query, skipping the task being edited and
 * tasks already chosen in another row.
 */
function getMatchingRelatedTasks(row: HTMLLIElement, query: string): RelatedTaskCandidate[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const selectedElsewhere = getRelatedTaskRows()
        .filter((candidateRow) => candidateRow !== row)
        .map((candidateRow) => relatedTaskSelections.get(candidateRow))
        .filter((reference): reference is RelatedTaskReference => reference !== undefined);
    return relatedTaskCandidates.filter((candidate) =>
        !(candidate.isCurrentRepository && candidate.taskId === editingTaskId) &&
        !selectedElsewhere.some((reference) => isSameRelatedTask(reference, candidate)) &&
        candidate.taskName.toLocaleLowerCase().includes(normalizedQuery));
}

function selectRelatedTask(row: HTMLLIElement, reference: RelatedTaskReference): void {
    const selection: RelatedTaskReference = {
        taskId: reference.taskId,
        taskName: reference.taskName,
        repositoryName: reference.repositoryName,
        repositoryPath: reference.repositoryPath,
        repositoryUrl: reference.repositoryUrl,
    };
    relatedTaskSelections.set(row, selection);
    const input = row.querySelector<HTMLInputElement>('.related-task-input');
    if (input) {
        input.value = selection.taskName;
    }
    updateRelatedTaskTag(row);
    setFieldError('relatedTasks', undefined);
}

function updateRelatedTaskTag(row: HTMLLIElement): void {
    const tag = row.querySelector<HTMLElement>('.related-task-repository-tag');
    if (!tag) {
        return;
    }
    const selection = relatedTaskSelections.get(row);
    tag.textContent = selection?.repositoryName ?? '';
    tag.hidden = !selection || selection.repositoryName === '';
}

/** Updates the stored names of existing links from the loaded candidates, in case a task or repository was renamed. */
function refreshRelatedTaskSelections(): void {
    for (const row of getRelatedTaskRows()) {
        const selection = relatedTaskSelections.get(row);
        const input = row.querySelector<HTMLInputElement>('.related-task-input');
        const candidate = selection && relatedTaskCandidates.find((item) => isSameRelatedTask(item, selection));
        if (candidate && input && input.value === selection.taskName) {
            selectRelatedTask(row, candidate);
        }
    }
}

/**
 * Reads the chosen links. Empty rows are ignored; a row with text but no chosen task is returned
 * without a task ID so validation reports it.
 */
function readRelatedTaskRows(): RelatedTaskReference[] {
    const references: RelatedTaskReference[] = [];
    for (const row of getRelatedTaskRows()) {
        const input = row.querySelector<HTMLInputElement>('.related-task-input');
        const selection = relatedTaskSelections.get(row);
        if (selection && input?.value === selection.taskName) {
            if (!references.some((reference) => isSameRelatedTask(reference, selection))) {
                references.push(selection);
            }
        } else if (input && input.value.trim() !== '') {
            references.push({ taskId: '', taskName: input.value.trim(), repositoryName: '', repositoryPath: '', repositoryUrl: '' });
        }
    }
    return references;
}

function getRelatedTaskRows(): HTMLLIElement[] {
    return Array.from(relatedTaskList?.querySelectorAll<HTMLLIElement>('.related-task-row') ?? []);
}

function getRelatedTaskListbox(input: HTMLInputElement): HTMLUListElement | null {
    const listboxId = input.getAttribute('aria-controls');
    return listboxId ? document.getElementById(listboxId) as HTMLUListElement | null : null;
}

function setRelatedTaskStatus(message: string): void {
    if (relatedTaskStatus) {
        relatedTaskStatus.textContent = message;
        relatedTaskStatus.hidden = message === '';
    }
}
