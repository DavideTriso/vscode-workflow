import { filterTasks, validateTaskInput } from '../../tasks/taskModel';
import { outputAgents } from '../../tasks/taskProtocol';
import type {
    AgentOutputGroup,
    CreateTaskInput,
    ExtensionToWebviewMessage,
    ImplementationTodoItem,
    ImplementationTodoItemDraft,
    TaskFieldErrors,
    TaskSummary,
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
const creatorFilterToggle = document.querySelector<HTMLButtonElement>('#creator-filter-toggle');
const taskList = document.querySelector<HTMLUListElement>('#task-list');
const emptyMessage = document.querySelector<HTMLParagraphElement>('#empty-message');
const createTaskPanel = document.querySelector<HTMLElement>('#create-task-panel');
const createTaskForm = document.querySelector<HTMLFormElement>('#create-task-form');
const taskNameInput = document.querySelector<HTMLInputElement>('#task-name');
const taskUrlInput = document.querySelector<HTMLInputElement>('#task-url');
const taskDescriptionInput = document.querySelector<HTMLTextAreaElement>('#task-description');
const taskFormHeading = document.querySelector<HTMLHeadingElement>('#create-task-heading');
const createTaskSubmit = document.querySelector<HTMLButtonElement>('#create-task-submit');
const cancelCreateTask = document.querySelector<HTMLButtonElement>('#cancel-create-task');
const createTaskError = document.querySelector<HTMLParagraphElement>('#create-task-error');
const fieldInputIds: Record<keyof CreateTaskInput, string> = {
    name: 'task-name',
    projectManagementUrl: 'task-url',
    description: 'task-description',
};
const fieldErrorIds: Record<keyof CreateTaskInput, string> = {
    name: 'task-name-error',
    projectManagementUrl: 'task-url-error',
    description: 'task-description-error',
};
let tasks: TaskSummary[] = [];
let editingTaskId: string | undefined;
let selectedTask: TaskSummary | undefined;
let taskActionPending = false;
let filterByCreator = true;
let requireProjectManagementUrl = true;
let gitUserEmail: string | undefined;
let outputTaskId: string | undefined;
let agentOutputs: AgentOutputGroup[] = [];
const expandedOutputAgents = new Set<string>();
const selectedOutputFiles = new Map<string, string>();
const pendingTodoChanges = new Map<string, boolean>();
let draggedTodoItemId: string | undefined;
let todoEditorState: { taskId: string; itemId?: string; groupName: string } | undefined;
const todoIcons = {
    view: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h9l5 5v13H5zM14 3v6h6M8 14h8M8 17h8"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L20 7.5 16.5 4 4 16.5zM14.8 5.7l3.5 3.5"/></svg>',
    remove: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 5v5m4-5v5"/></svg>',
    add: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>',
};

if (
    repositoryMessage && taskPanel && selectedTaskPanel && selectedTaskName && selectedTaskDescription && descriptionToggle &&
    timeTrackingToggle && taskStatusToggle && taskActionError &&
    taskListPanel && tasksAccordionToggle && tasksAccordionContent && quickReferenceToggle && quickReferenceContent &&
    addTaskButton && reloadTasksButton &&
    searchInput && creatorFilterToggle && taskList && emptyMessage && createTaskPanel &&
    createTaskForm && taskNameInput && taskUrlInput && taskDescriptionInput && createTaskSubmit &&
    cancelCreateTask && createTaskError
) {
    window.addEventListener('message', (event: MessageEvent<ExtensionToWebviewMessage>) => {
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
    creatorFilterToggle.addEventListener('click', toggleCreatorFilter);
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
    vscode.postMessage({ type: 'ready' });
}

function handleExtensionMessage(message: Exclude<ExtensionToWebviewMessage, { type: 'repositoryUnavailable' }>): void {
    if (message.type === 'taskSettings') {
        requireProjectManagementUrl = message.requireProjectManagementUrl;
        applyUrlRequirement();
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
    gitUserEmail = message.gitUserEmail;
    updateCreatorFilterToggle();
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
    const filteredTasks = filterTasks(tasks, query, filterByCreator, gitUserEmail);
    const rows = filteredTasks.map(createTaskRow);
    taskList.replaceChildren(...rows);
    emptyMessage.hidden = rows.length > 0;
    emptyMessage.textContent = getEmptyMessage(query);
}

function toggleCreatorFilter(): void {
    filterByCreator = !filterByCreator;
    updateCreatorFilterToggle();
    renderTasks();
}

function updateCreatorFilterToggle(): void {
    if (!creatorFilterToggle) {
        return;
    }
    creatorFilterToggle.classList.toggle('is-active', filterByCreator);
    creatorFilterToggle.setAttribute('aria-pressed', String(filterByCreator));
    creatorFilterToggle.title = filterByCreator
        ? 'Filter to tasks created by you'
        : 'Show tasks created by anyone';
    creatorFilterToggle.setAttribute('aria-label', creatorFilterToggle.title);
}

function getEmptyMessage(query: string): string {
    if (filterByCreator && !gitUserEmail) {
        return 'Set your Git email or turn off the creator filter.';
    }
    if (query.trim() !== '') {
        return 'No matching tasks.';
    }
    return filterByCreator ? 'No tasks created by you.' : 'No open tasks.';
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

    const deleteButton = document.createElement('button');
    const editButton = document.createElement('button');
    const openButton = document.createElement('button');
    const selectButton = document.createElement('button');
    selectButton.className = 'task-select';
    selectButton.type = 'button';
    selectButton.dataset.taskId = task.id;
    selectButton.setAttribute('aria-pressed', String(selectedTask?.id === task.id));
    if (selectedTask?.id === task.id) {
        selectButton.setAttribute('aria-current', 'true');
    }

    editButton.className = 'task-action edit-task';
    editButton.type = 'button';
    editButton.dataset.taskId = task.id;
    editButton.title = `Edit ${task.name}`;
    editButton.setAttribute('aria-label', `Edit ${task.name}`);
    editButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L20 7.5 16.5 4 4 16.5zM14.8 5.7l3.5 3.5"/></svg>';

    openButton.className = 'task-action open-task-file';
    openButton.type = 'button';
    openButton.dataset.taskId = task.id;
    openButton.title = `Open ${task.name}`;
    openButton.setAttribute('aria-label', `Open ${task.name}`);
    openButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h9l5 5v13H5zM14 3v6h6M8 14h8M8 17h8"/></svg>';

    deleteButton.className = 'delete-task';
    deleteButton.classList.add('task-action');
    deleteButton.type = 'button';
    deleteButton.dataset.taskId = task.id;
    deleteButton.title = `Delete ${task.name}`;
    deleteButton.setAttribute('aria-label', `Delete ${task.name}`);
    deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 5v5m4-5v5"/></svg>';

    details.append(nameLine, createdOn);
    selectButton.append(details);
    row.append(selectButton, openButton, editButton, deleteButton);
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
    if (button.classList.contains('edit-task')) {
        vscode.postMessage({ type: 'editTask', taskId });
        return;
    }
    if (button.classList.contains('open-task-file')) {
        vscode.postMessage({ type: 'openTaskFile', taskId });
        return;
    }
    if (button.classList.contains('delete-task')) {
        vscode.postMessage({ type: 'deleteTask', taskId });
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

    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'agent-output-view task-action';
    viewButton.innerHTML = todoIcons.view;
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
    addTodoButton.innerHTML = todoIcons.add;
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
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'implementation-todo-edit task-action';
    editButton.innerHTML = todoIcons.edit;
    editButton.title = `Edit ${item.title}`;
    editButton.setAttribute('aria-label', `Edit ${item.title}`);
    editButton.addEventListener('click', () => {
        showTodoEditor(item, groupName);
    });
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'implementation-todo-remove task-action delete-task';
    removeButton.innerHTML = todoIcons.remove;
    removeButton.title = `Remove ${item.title}`;
    removeButton.setAttribute('aria-label', `Remove ${item.title}`);
    removeButton.addEventListener('click', () => {
        if (selectedTask) {
            vscode.postMessage({ type: 'removeTodo', taskId: selectedTask.id, itemId: item.id });
        }
    });
    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'implementation-todo-view task-action';
    viewButton.innerHTML = todoIcons.view;
    viewButton.title = `View ${item.title}`;
    viewButton.setAttribute('aria-label', viewButton.title);
    viewButton.addEventListener('click', () => {
        if (selectedTask) {
            vscode.postMessage({ type: 'viewTodo', taskId: selectedTask.id, itemId: item.id });
        }
    });
    actions.append(viewButton, editButton, removeButton);
    row.append(actions);
    return row;
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
    vscode.postMessage({ type: 'saveTask', input });
}

function readCreateTaskInput(): CreateTaskInput {
    return {
        name: taskNameInput?.value ?? '',
        projectManagementUrl: taskUrlInput?.value ?? '',
        description: taskDescriptionInput?.value ?? '',
    };
}

function showFieldErrors(errors: TaskFieldErrors): void {
    setFieldError('name', errors.name);
    setFieldError('projectManagementUrl', errors.projectManagementUrl);
    setFieldError('description', errors.description);
}

function clearFieldError(event: Event): void {
    const field = event.currentTarget;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
        return;
    }
    if (field.name === 'name' || field.name === 'projectManagementUrl' || field.name === 'description') {
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
    createTaskForm?.reset();
    clearAllFieldErrors();
    taskFormHeading.textContent = 'New task';
    createTaskPanel.hidden = false;
    taskListPanel.hidden = true;
    showCreateTaskError('');
    taskNameInput.focus();
}

function showEditTaskForm(task: TaskSummary): void {
    if (!createTaskPanel || !taskListPanel || !taskNameInput || !taskUrlInput || !taskDescriptionInput || !taskFormHeading) {
        return;
    }
    editingTaskId = task.id;
    taskFormHeading.textContent = 'Edit task';
    taskNameInput.value = task.name;
    taskUrlInput.value = task.projectManagementUrl;
    taskDescriptionInput.value = task.description;
    clearAllFieldErrors();
    showCreateTaskError('');
    createTaskPanel.hidden = false;
    taskListPanel.hidden = true;
    taskNameInput.focus();
}

function closeCreateTaskForm(): void {
    editingTaskId = undefined;
    createTaskForm?.reset();
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