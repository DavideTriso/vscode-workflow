import { validateTaskInput } from '../../tasks/taskModel';
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
const taskListPanel = document.querySelector<HTMLElement>('#task-list-panel');
const searchInput = document.querySelector<HTMLInputElement>('#task-search');
const taskList = document.querySelector<HTMLUListElement>('#task-list');
const emptyMessage = document.querySelector<HTMLParagraphElement>('#empty-message');
const createTaskPanel = document.querySelector<HTMLElement>('#create-task-panel');
const createTaskForm = document.querySelector<HTMLFormElement>('#create-task-form');
const taskNameInput = document.querySelector<HTMLInputElement>('#task-name');
const taskUrlInput = document.querySelector<HTMLInputElement>('#task-url');
const taskDescriptionInput = document.querySelector<HTMLTextAreaElement>('#task-description');
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

if (
    repositoryMessage && taskPanel && taskListPanel && searchInput && taskList && emptyMessage && createTaskPanel &&
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
    taskList.addEventListener('click', handleTaskListClick);
    createTaskForm.addEventListener('submit', handleCreateTaskSubmit);
    cancelCreateTask.addEventListener('click', closeCreateTaskForm);
    taskNameInput.addEventListener('input', clearFieldError);
    taskUrlInput.addEventListener('input', clearFieldError);
    taskDescriptionInput.addEventListener('input', clearFieldError);
    vscode.postMessage({ type: 'ready' });
}

function handleExtensionMessage(message: Exclude<ExtensionToWebviewMessage, { type: 'repositoryUnavailable' }>): void {
    if (message.type === 'openCreateForm') {
        showCreateTaskForm();
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
    if (message.type === 'taskCreated') {
        closeCreateTaskForm();
        searchInput?.focus();
        return;
    }

    if (repositoryMessage) {
        repositoryMessage.hidden = true;
    }
    if (taskPanel) {
        taskPanel.hidden = false;
    }
    tasks = message.tasks;
    renderTasks();
}

function renderTasks(): void {
    if (!searchInput || !taskList || !emptyMessage) {
        return;
    }

    const query = searchInput.value.trim().toLocaleLowerCase();
    const filteredTasks = tasks.filter((task) => task.name.toLocaleLowerCase().includes(query));
    const rows = filteredTasks.map(createTaskRow);
    taskList.replaceChildren(...rows);
    emptyMessage.hidden = rows.length > 0;
    emptyMessage.textContent = query === '' ? 'No open tasks.' : 'No matching tasks.';
}

function createTaskRow(task: TaskSummary): HTMLLIElement {
    const row = document.createElement('li');
    row.className = 'task-row';

    const details = document.createElement('div');
    details.className = 'task-details';

    const name = document.createElement('span');
    name.className = 'task-name';
    name.textContent = task.name;

    const createdOn = document.createElement('time');
    createdOn.className = 'task-date';
    createdOn.dateTime = task.createdOnDateTime;
    createdOn.textContent = formatDate(task.createdOnDateTime);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-task';
    deleteButton.type = 'button';
    deleteButton.dataset.taskId = task.id;
    deleteButton.title = `Delete ${task.name}`;
    deleteButton.setAttribute('aria-label', `Delete ${task.name}`);
    deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 5v5m4-5v5"/></svg>';

    details.append(name, createdOn);
    row.append(details, deleteButton);
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

    const button = target.closest<HTMLButtonElement>('.delete-task');
    const taskId = button?.dataset.taskId;
    if (!taskId) {
        return;
    }

    vscode.postMessage({ type: 'deleteTask', taskId });
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
    vscode.postMessage({ type: 'createTask', input });
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
    if (!createTaskPanel || !taskListPanel || !taskNameInput || !createTaskError) {
        return;
    }
    createTaskPanel.hidden = false;
    taskListPanel.hidden = true;
    showCreateTaskError('');
    taskNameInput.focus();
}

function closeCreateTaskForm(): void {
    createTaskForm?.reset();
    createTaskPanel?.setAttribute('hidden', '');
    if (taskListPanel) {
        taskListPanel.hidden = false;
    }
    setFieldError('name', undefined);
    setFieldError('projectManagementUrl', undefined);
    setFieldError('description', undefined);
    showCreateTaskError('');
    setCreateTaskSubmitEnabled(true);
    searchInput?.focus();
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