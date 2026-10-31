import { filterTasks, validateTaskInput } from '../../tasks/taskModel';
import type {
    CreateTaskInput,
    ExtensionToWebviewMessage,
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
const timeTrackingToggle = document.querySelector<HTMLButtonElement>('#time-tracking-toggle');
const taskStatusToggle = document.querySelector<HTMLButtonElement>('#task-status-toggle');
const taskActionError = document.querySelector<HTMLParagraphElement>('#task-action-error');
const taskListPanel = document.querySelector<HTMLElement>('#task-list-panel');
const tasksAccordionToggle = document.querySelector<HTMLButtonElement>('#tasks-accordion-toggle');
const tasksAccordionContent = document.querySelector<HTMLElement>('#tasks-accordion-content');
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
let gitUserEmail: string | undefined;

if (
    repositoryMessage && taskPanel && selectedTaskPanel && selectedTaskName && selectedTaskDescription && descriptionToggle &&
    timeTrackingToggle && taskStatusToggle && taskActionError &&
    taskListPanel && tasksAccordionToggle && tasksAccordionContent && addTaskButton && reloadTasksButton &&
    searchInput && creatorFilterToggle && taskList && emptyMessage && createTaskPanel &&
    createTaskForm && taskNameInput && taskUrlInput && taskDescriptionInput && createTaskSubmit &&
    cancelCreateTask && createTaskError
) {
    window.addEventListener('message', (event: MessageEvent<ExtensionToWebviewMessage>) => {
        if (event.data.type === 'repositoryUnavailable') {
            taskPanel.hidden = true;
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
    setTasksAccordionExpanded(false);
    renderTasks();
    renderSelectedTask();
    vscode.postMessage({ type: 'selectTask', taskId });
}

function renderSelectedTask(): void {
    if (!selectedTaskPanel || !selectedTaskName || !selectedTaskDescription || !descriptionToggle) {
        return;
    }

    selectedTaskPanel.hidden = !selectedTask;
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

function toggleDescription(): void {
    if (!selectedTaskDescription || !descriptionToggle) {
        return;
    }
    const isExpanded = selectedTaskDescription.classList.toggle('is-expanded');
    selectedTaskDescription.classList.toggle('is-collapsed', !isExpanded);
    descriptionToggle.textContent = isExpanded ? 'Show less' : 'Show more';
    descriptionToggle.setAttribute('aria-expanded', String(isExpanded));
}

function handleCreateTaskSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const input = readCreateTaskInput();
    const errors = validateTaskInput(input);
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