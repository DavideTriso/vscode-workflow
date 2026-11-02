"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode4 = __toESM(require("vscode"));

// src/tasks/implementationTodoTools.ts
var vscode = __toESM(require("vscode"));
var todoToolNames = {
  read: "vscode-workflow_read_implementation_todos",
  manage: "vscode-workflow_manage_implementation_todos",
  syncLogic: "vscode-workflow_sync_logic_review_todos",
  syncReadability: "vscode-workflow_sync_code_readability_todos"
};
function registerImplementationTodoTools(context, repository) {
  registerTool(context, todoToolNames.read, repository, async (activeTask) => repository.readImplementationTodo(activeTask.repositoryRoot, activeTask.taskId));
  registerTool(context, todoToolNames.manage, repository, async (activeTask, input) => {
    if (input.action === "add") {
      if (!input.group || !input.item) {
        throw new Error("The add action requires a group and item.");
      }
      return repository.addImplementationTodoItem(activeTask.repositoryRoot, activeTask.taskId, input.group, input.item, "agent");
    }
    if (input.action === "update" || input.action === "reconcile") {
      if (!input.itemId || !input.changes) {
        throw new Error("The update action requires an item ID and changes.");
      }
      return repository.updateImplementationTodoItem(
        activeTask.repositoryRoot,
        activeTask.taskId,
        input.itemId,
        input.group,
        input.changes,
        "agent",
        input.action === "reconcile"
      );
    }
    if (input.action === "remove") {
      if (!input.itemId) {
        throw new Error("The remove action requires an item ID.");
      }
      await repository.removeImplementationTodoItem(activeTask.repositoryRoot, activeTask.taskId, input.itemId, "agent");
      return { removed: input.itemId };
    }
    if (input.action === "reorder") {
      if (!input.groups) {
        throw new Error("The reorder action requires the ordered groups and item IDs.");
      }
      await repository.reorderImplementationTodos(activeTask.repositoryRoot, activeTask.taskId, input.groups, "agent");
      return repository.readImplementationTodo(activeTask.repositoryRoot, activeTask.taskId);
    }
    if (input.action === "sync-plan") {
      if (!input.plan || !input.planGroups) {
        throw new Error("The sync-plan action requires a plan path and complete ordered planGroups.");
      }
      return repository.syncImplementationPlanTodos(
        activeTask.repositoryRoot,
        activeTask.taskId,
        input.plan,
        input.planGroups
      );
    }
    if (!input.plan) {
      throw new Error("The set-plan action requires the selected plan path.");
    }
    await repository.updateImplementationTodoPlan(activeTask.repositoryRoot, activeTask.taskId, input.plan);
    return repository.readImplementationTodo(activeTask.repositoryRoot, activeTask.taskId);
  });
  registerTool(context, todoToolNames.syncLogic, repository, async (activeTask, input) => {
    const items = input.items.map((item) => ({ ...item, source: "logic-review", done: false }));
    return repository.syncReviewTodos(activeTask.repositoryRoot, activeTask.taskId, "logic-review", "Logic Review", items);
  });
  registerTool(context, todoToolNames.syncReadability, repository, async (activeTask, input) => {
    const items = input.items.map((item) => ({ ...item, source: "code-readability" }));
    return repository.syncReviewTodos(activeTask.repositoryRoot, activeTask.taskId, "code-readability", "Readability", items);
  });
}
function registerTool(context, name, repository, operation) {
  const tool = {
    async invoke(options, token) {
      if (token.isCancellationRequested) {
        throw new Error("TODO operation was cancelled.");
      }
      const activeTask = await getActiveTaskContext(repository);
      const result = await operation(activeTask, options.input);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
      ]);
    }
  };
  context.subscriptions.push(vscode.lm.registerTool(name, tool));
}
async function getActiveTaskContext(repository) {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspacePath) {
    throw new Error("Open the task repository before using TODO tools.");
  }
  const repositoryRoot = await repository.findRepositoryRoot(workspacePath);
  if (!repositoryRoot) {
    throw new Error("Open the task Git repository before using TODO tools.");
  }
  const activeTask = await repository.getActiveAgentTask(repositoryRoot);
  return { repositoryRoot, taskId: activeTask.taskId };
}

// src/tasks/taskRepository.ts
var import_node_child_process = require("node:child_process");
var import_node_crypto = require("node:crypto");
var import_promises = require("node:fs/promises");
var import_node_path = __toESM(require("node:path"));
var import_node_util = require("node:util");

// src/tasks/taskModel.ts
function createOpenTaskSummary(fileName, value) {
  const task = createTaskSummary(fileName, value);
  if (!task || task.status === 2) {
    return void 0;
  }
  return task;
}
function createTaskSummary(fileName, value) {
  if (!isRecord(value) || !isTaskStatus(value.status)) {
    return void 0;
  }
  const { name, createdOnDateTime } = value;
  if (typeof name !== "string" || name.trim() === "" || typeof createdOnDateTime !== "string" || !Number.isFinite(Date.parse(createdOnDateTime))) {
    return void 0;
  }
  return {
    id: fileName,
    name,
    createdOnDateTime,
    projectManagementUrl: typeof value.projectManagementUrl === "string" ? value.projectManagementUrl : "",
    description: typeof value.description === "string" ? value.description : "",
    ...typeof value.createdBy === "string" ? { createdBy: value.createdBy } : {},
    status: value.status,
    timeTracking: readTimeTracking(value.timeTracking)
  };
}
function compareTasksNewestFirst(left, right) {
  return Date.parse(right.createdOnDateTime) - Date.parse(left.createdOnDateTime);
}
function validateTaskInput(input) {
  const errors = {};
  if (input.name.trim() === "") {
    errors.name = "Enter a task name.";
  }
  if (input.projectManagementUrl.trim() === "") {
    errors.projectManagementUrl = "Enter a project management URL.";
  } else if (!isHttpUrl(input.projectManagementUrl.trim())) {
    errors.projectManagementUrl = "Enter a valid http or https URL.";
  }
  if (input.description.trim() === "") {
    errors.description = "Enter a task description.";
  }
  return errors;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isTaskStatus(value) {
  return value === 0 || value === 1 || value === 2;
}
function readTimeTracking(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isTimeTrackingEntry);
}
function isTimeTrackingEntry(value) {
  return isRecord(value) && typeof value.startDateTime === "string" && (typeof value.endDateTime === "string" || value.endDateTime === null) && (value.user === void 0 || typeof value.user === "string");
}
function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// src/tasks/implementationTodo.ts
var todoSources = ["plan", "request", "user-note", "logic-review", "code-readability"];
function parseImplementationTodo(content) {
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("Implementation TODO file contains invalid JSON.");
  }
  if (!isRecord2(value) || value.version !== 1 || !isString(value.summary) || value.summary.length > 500 || !isString(value.plan) || !isString(value.planSyncedAt) || !Array.isArray(value.groups)) {
    throw new Error("Implementation TODO file has an invalid document structure.");
  }
  const itemIds = /* @__PURE__ */ new Set();
  const groups = value.groups.map((group) => parseGroup(group, itemIds));
  return {
    version: 1,
    summary: value.summary,
    plan: value.plan,
    planSyncedAt: value.planSyncedAt,
    groups
  };
}
function serializeImplementationTodo(todo) {
  return `${JSON.stringify(todo, null, 2)}
`;
}
function summarizeImplementationTodo(groups) {
  const items = groups.flatMap((group) => group.items);
  const done = items.filter((item) => item.done).length;
  const open = items.length - done;
  const nextItem = items.find((item) => !item.done);
  const alerts = items.filter((item) => item.alert !== null).map((item) => `${item.title}: ${item.alert}`);
  const sentences = [`${done} done, ${open} open.`];
  sentences.push(nextItem ? `Next: ${nextItem.title}.` : "No open items.");
  if (alerts.length > 0) {
    sentences.push(`Alerts: ${alerts.join("; ")}.`);
  }
  return sentences.join(" ").slice(0, 500);
}
function renderImplementationTodoMarkdown(todo) {
  const sections = todo.groups.map((group) => {
    const items = group.items.map((item) => {
      const details = [
        `### ${item.done ? "Done" : "Open"} - ${item.title}`,
        "",
        `- ID: \`${item.id}\``,
        `- Source: ${item.sourceRef}`,
        `- Why: ${item.why}`,
        `- Files: ${item.files.length > 0 ? item.files.map((file) => `\`${file}\``).join(", ") : "None listed"}`,
        `- Decisions: ${item.decisions}`,
        `- Acceptance: ${item.acceptance}`,
        `- Evidence: ${item.evidence || "None yet"}`,
        `- Remaining: ${item.remaining || "None"}`
      ];
      if (item.alert) {
        details.push(`- Alert: ${item.alert}`);
      }
      return details.join("\n");
    });
    return [`## ${group.name}`, "", ...items.length > 0 ? items : ["No items."]].join("\n");
  });
  return [`# Implementation TODOs`, "", `## Summary`, "", todo.summary, "", `Plan: ${todo.plan}`, "", ...sections].join("\n");
}
function parseGroup(value, itemIds) {
  if (!isRecord2(value) || !isString(value.name) || value.name.trim() === "" || value.name.length > 60 || !Array.isArray(value.items)) {
    throw new Error("Implementation TODO file contains an invalid group.");
  }
  return { name: value.name, items: value.items.map((item) => parseItem(item, itemIds)) };
}
function parseItem(value, itemIds) {
  if (!isRecord2(value) || !isString(value.id) || !/^[a-z0-9][a-z0-9-]*$/.test(value.id) || itemIds.has(value.id) || "priority" in value || "weight" in value || !isString(value.title) || value.title.trim() === "" || !hasValidCompletion(value) || !isTodoSource(value.source) || !isString(value.sourceRef) || value.sourceRef.trim() === "" || !isString(value.why) || !isStringArray(value.files) || !isString(value.decisions) || !isString(value.acceptance) || !isString(value.evidence) || !isString(value.remaining) || !(value.alert === null || isString(value.alert)) || !(value.createdBy === void 0 || value.createdBy === "agent" || value.createdBy === "user") || !(value.updatedBy === "agent" || value.updatedBy === "user") || !isValidDate(value.updatedAt)) {
    throw new Error("Implementation TODO file contains an invalid item or duplicate ID.");
  }
  itemIds.add(value.id);
  return {
    id: value.id,
    title: value.title,
    done: typeof value.done === "boolean" ? value.done : value.status === "DONE",
    source: value.source,
    sourceRef: value.sourceRef,
    why: value.why,
    files: value.files,
    decisions: value.decisions,
    acceptance: value.acceptance,
    evidence: value.evidence,
    remaining: value.remaining,
    alert: value.alert,
    createdBy: value.createdBy === "user" ? "user" : "agent",
    updatedBy: value.updatedBy,
    updatedAt: value.updatedAt
  };
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isString(value) {
  return typeof value === "string";
}
function isStringArray(value) {
  return Array.isArray(value) && value.every(isString);
}
function hasValidCompletion(value) {
  if ("done" in value) {
    return typeof value.done === "boolean";
  }
  return value.status === "DONE" || value.status === "MISSING" || value.status === "LATER";
}
function isTodoSource(value) {
  return todoSources.includes(value);
}
function isValidDate(value) {
  return isString(value) && Number.isFinite(Date.parse(value));
}

// src/tasks/taskProtocol.ts
var outputAgents = [
  { id: "analyze-and-plan", name: "Analyze and Plan", fileName: "implementation-plan.md" },
  { id: "logic-review", name: "Logic Review", fileName: "logic-review.md" },
  { id: "code-readability", name: "Code Readability", fileName: "readability-review.md" },
  { id: "document", name: "Document", fileName: "documentation-update.md" },
  { id: "debug", name: "Debug", fileName: "debug-report.md" },
  { id: "implement", name: "Implementation TODOs", fileName: "implementation-todo.json" }
];

// src/tasks/taskRepository.ts
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process.execFile);
var TaskRepository = class {
  constructor(gitEmailProvider = readGitUserEmail) {
    this.gitEmailProvider = gitEmailProvider;
  }
  todoWriteLocks = /* @__PURE__ */ new Map();
  async findRepositoryRoot(workspacePath) {
    try {
      const result = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
        cwd: workspacePath,
        encoding: "utf8",
        windowsHide: true
      });
      return result.stdout.trim() || void 0;
    } catch {
      return void 0;
    }
  }
  async listOpenTasks(repositoryRoot) {
    const directory = this.getTaskDirectory(repositoryRoot);
    const entries = await this.readTaskEntries(directory);
    const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
    const taskResults = await Promise.all(
      jsonFiles.map(async (entry) => {
        const content = await (0, import_promises.readFile)(import_node_path.default.join(directory, entry.name), "utf8");
        try {
          return createOpenTaskSummary(entry.name, JSON.parse(content));
        } catch {
          return void 0;
        }
      })
    );
    return taskResults.filter((task) => task !== void 0).sort(compareTasksNewestFirst);
  }
  async getTask(repositoryRoot, taskId) {
    const { taskFileName, originalValue } = await this.readTaskRecord(repositoryRoot, taskId);
    return createTaskSummary(taskFileName, originalValue);
  }
  getGitUserEmail(repositoryRoot) {
    return this.gitEmailProvider(repositoryRoot);
  }
  getTaskFilePath(repositoryRoot, taskId) {
    return import_node_path.default.join(this.getTaskDirectory(repositoryRoot), this.validateTaskId(taskId));
  }
  async getActiveAgentTask(repositoryRoot) {
    const markers = await this.listAgentTaskMarkers(repositoryRoot);
    if (markers.length !== 1) {
      throw new Error(markers.length === 0 ? "Start a task timer before using implementation TODO tools." : "More than one task is active. Resolve the active task marker before continuing.");
    }
    return markers[0].context;
  }
  async readImplementationTodo(repositoryRoot, taskId) {
    const filePath = await this.getImplementationTodoPath(repositoryRoot, taskId);
    try {
      return parseImplementationTodo(await (0, import_promises.readFile)(filePath, "utf8"));
    } catch (error) {
      if (getErrorCode(error) === "ENOENT") {
        return createEmptyImplementationTodo();
      }
      throw error;
    }
  }
  async listAgentOutputs(repositoryRoot, taskId) {
    const directory = import_node_path.default.join(this.getAgentHistoryDirectory(repositoryRoot), this.validateTaskId(taskId));
    const entries = await this.readTaskEntries(directory);
    return Promise.all(outputAgents.map(async (agent) => {
      const fileEntries = entries.filter((entry) => entry.isFile() && matchesAgentOutput(agent.id, entry.name));
      if (agent.id === "implement") {
        const entry = fileEntries[0];
        if (!entry) {
          return { id: agent.id, name: agent.name, files: [] };
        }
        try {
          const filePath = await this.getAgentOutputPath(repositoryRoot, taskId, entry.name);
          const content = await (0, import_promises.readFile)(filePath, "utf8");
          const todo = parseImplementationTodo(content);
          return {
            id: agent.id,
            name: agent.name,
            files: [{ fileName: entry.name, summary: summarizeImplementationTodo(todo.groups) }],
            todoGroups: todo.groups
          };
        } catch (error) {
          if (getErrorCode(error) === "ENOENT") {
            return { id: agent.id, name: agent.name, files: [] };
          }
          return {
            id: agent.id,
            name: agent.name,
            files: [{ fileName: entry.name, summary: "The TODO list could not be loaded." }],
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
      const files = await Promise.all(fileEntries.map(async (entry) => {
        try {
          const filePath = await this.getAgentOutputPath(repositoryRoot, taskId, entry.name);
          const [content, metadata] = await Promise.all([(0, import_promises.readFile)(filePath, "utf8"), (0, import_promises.stat)(filePath)]);
          return { fileName: entry.name, summary: extractOutputSummary(content), modified: metadata.mtimeMs };
        } catch (error) {
          if (getErrorCode(error) === "ENOENT") {
            return void 0;
          }
          throw error;
        }
      }));
      return {
        id: agent.id,
        name: agent.name,
        files: files.filter((file) => file !== void 0).sort((first, second) => second.modified - first.modified || second.fileName.localeCompare(first.fileName)).map(({ fileName, summary }) => ({ fileName, summary }))
      };
    }));
  }
  async getImplementationTodoMarkdown(repositoryRoot, taskId) {
    const todo = await this.readImplementationTodo(repositoryRoot, taskId);
    return renderImplementationTodoMarkdown(todo);
  }
  async getImplementationTodoItemMarkdown(repositoryRoot, taskId, itemId) {
    const todo = await this.readImplementationTodo(repositoryRoot, taskId);
    const item = findTodoItem(todo.groups, itemId);
    const groupName = findTodoGroupName(todo.groups, itemId);
    return renderImplementationTodoMarkdown({
      ...todo,
      summary: summarizeImplementationTodo([{ name: groupName, items: [item] }]),
      groups: [{ name: groupName, items: [item] }]
    });
  }
  async setTodoStatus(repositoryRoot, taskId, itemId, done, now = /* @__PURE__ */ new Date()) {
    await this.updateImplementationTodoItem(repositoryRoot, taskId, itemId, void 0, {
      done
    }, "user", false, now);
  }
  async addImplementationTodoItem(repositoryRoot, taskId, groupName, draft, actor, now = /* @__PURE__ */ new Date()) {
    validateTodoGroupName(groupName);
    const id = createTodoId(draft.title);
    const item = {
      ...draft,
      sourceRef: actor === "user" ? `user:${id}` : draft.sourceRef,
      id,
      createdBy: actor,
      updatedBy: actor,
      updatedAt: toIsoSeconds(now)
    };
    await this.mutateImplementationTodo(repositoryRoot, taskId, (todo) => {
      const groups = appendTodoItem(todo.groups, groupName, item);
      return withUpdatedTodo(todo, groups);
    });
    return item;
  }
  async updateImplementationTodoItem(repositoryRoot, taskId, itemId, groupName, changes, actor, allowStatusReconciliation = false, now = /* @__PURE__ */ new Date()) {
    if (groupName !== void 0) {
      validateTodoGroupName(groupName);
    }
    let updatedItem;
    await this.mutateImplementationTodo(repositoryRoot, taskId, (todo) => {
      const current = findTodoItem(todo.groups, itemId);
      ensureTodoItemEditable(current, changes, actor, allowStatusReconciliation);
      const next = {
        ...current,
        ...changes,
        id: current.id,
        createdBy: current.createdBy,
        updatedBy: actor,
        updatedAt: toIsoSeconds(now)
      };
      updatedItem = next;
      return withUpdatedTodo(todo, moveOrUpdateTodoItem(todo.groups, current.id, groupName, next));
    });
    return updatedItem;
  }
  async removeImplementationTodoItem(repositoryRoot, taskId, itemId, actor) {
    await this.mutateImplementationTodo(repositoryRoot, taskId, (todo) => {
      const item = findTodoItem(todo.groups, itemId);
      if (actor === "agent" && item.createdBy === "user") {
        throw new Error("Agents cannot remove user-created TODO items.");
      }
      const groups = todo.groups.map((group) => ({ ...group, items: group.items.filter((candidate) => candidate.id !== itemId) }));
      return withUpdatedTodo(todo, groups);
    });
  }
  async reorderImplementationTodos(repositoryRoot, taskId, requestedGroups, actor) {
    await this.mutateImplementationTodo(repositoryRoot, taskId, (todo) => {
      const groups = reorderTodoGroups(todo.groups, requestedGroups, actor);
      return withUpdatedTodo(todo, groups);
    });
  }
  async syncReviewTodos(repositoryRoot, taskId, source, groupName, drafts, now = /* @__PURE__ */ new Date()) {
    validateTodoGroupName(groupName);
    await this.mutateImplementationTodo(repositoryRoot, taskId, (todo) => {
      const groups = syncReviewGroup(todo.groups, source, groupName, drafts, now);
      return withUpdatedTodo(todo, groups);
    });
    return this.readImplementationTodo(repositoryRoot, taskId);
  }
  async updateImplementationTodoPlan(repositoryRoot, taskId, plan, planSyncedAt = /* @__PURE__ */ new Date()) {
    await this.mutateImplementationTodo(repositoryRoot, taskId, (todo) => ({
      ...todo,
      plan,
      planSyncedAt: toIsoSeconds(planSyncedAt)
    }));
  }
  async syncImplementationPlanTodos(repositoryRoot, taskId, plan, plannedGroups, now = /* @__PURE__ */ new Date()) {
    if (plan.trim() === "") {
      throw new Error("The selected plan path cannot be empty.");
    }
    await this.mutateImplementationTodo(repositoryRoot, taskId, (todo) => {
      const existingAgentItems = todo.groups.flatMap((group) => group.items).filter((item) => item.createdBy === "agent" && item.source !== "user-note");
      const existingBySource = new Map(existingAgentItems.map((item) => [`${item.source}:${item.sourceRef}`, item]));
      const seenSourceReferences = /* @__PURE__ */ new Set();
      const planItems = plannedGroups.map((group) => {
        validateTodoGroupName(group.name);
        return {
          name: group.name,
          items: group.items.map((draft) => {
            if (draft.source === "user-note" || draft.sourceRef.trim() === "") {
              throw new Error("Plan synchronization requires agent-owned, source-referenced items.");
            }
            const sourceKey = `${draft.source}:${draft.sourceRef}`;
            if (seenSourceReferences.has(sourceKey)) {
              throw new Error(`Duplicate TODO source reference '${draft.sourceRef}'.`);
            }
            seenSourceReferences.add(sourceKey);
            const existing = existingBySource.get(sourceKey);
            return {
              ...draft,
              id: existing?.id ?? createTodoId(draft.title),
              createdBy: "agent",
              updatedBy: "agent",
              updatedAt: toIsoSeconds(now)
            };
          })
        };
      });
      const retainedAgentNotes = todo.groups.map((group) => ({
        name: group.name,
        items: group.items.filter((item) => item.createdBy === "agent" && item.source === "user-note")
      })).filter((group) => group.items.length > 0);
      const retainedUserItems = todo.groups.map((group) => ({
        name: group.name,
        items: group.items.filter((item) => item.createdBy === "user")
      })).filter((group) => group.items.length > 0);
      let groups = mergeRetainedTodoGroups(planItems, retainedAgentNotes);
      groups = mergeRetainedTodoGroups(groups, retainedUserItems);
      return {
        ...todo,
        plan,
        planSyncedAt: toIsoSeconds(now),
        groups,
        summary: summarizeImplementationTodo(groups)
      };
    });
    return this.readImplementationTodo(repositoryRoot, taskId);
  }
  async getAgentOutputPath(repositoryRoot, taskId, fileName) {
    const validTaskId = this.validateTaskId(taskId);
    if (import_node_path.default.basename(fileName) !== fileName || !outputAgents.some((agent) => matchesAgentOutput(agent.id, fileName))) {
      throw new Error("Invalid agent output file name.");
    }
    const root = await (0, import_promises.realpath)(repositoryRoot);
    const expectedPath = import_node_path.default.join(root, ".history", "agents", validTaskId, fileName);
    const resolvedPath = await (0, import_promises.realpath)(expectedPath);
    if (resolvedPath !== expectedPath) {
      throw new Error("Agent output must be a regular file in its task folder.");
    }
    if (!(await (0, import_promises.stat)(resolvedPath)).isFile()) {
      throw new Error("Agent output is not a file.");
    }
    return resolvedPath;
  }
  async createTask(repositoryRoot, input, now = /* @__PURE__ */ new Date()) {
    const createdBy = await this.requireGitUserEmail(repositoryRoot);
    const directory = this.getTaskDirectory(repositoryRoot);
    await (0, import_promises.mkdir)(directory, { recursive: true });
    const createdOnDateTime = now.toISOString().replace(/\.\d{3}Z$/, "Z");
    const timestamp = createdOnDateTime.slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
    const task = {
      name: input.name,
      createdOnDateTime,
      projectManagementUrl: input.projectManagementUrl,
      description: input.description,
      createdBy,
      status: 0,
      timeTracking: []
    };
    const content = `${JSON.stringify(task, null, 2)}
`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const taskId = `${timestamp}-${createRandomSuffix()}.json`;
      try {
        await (0, import_promises.writeFile)(import_node_path.default.join(directory, taskId), content, { encoding: "utf8", flag: "wx" });
        return taskId;
      } catch (error) {
        if (getErrorCode(error) !== "EEXIST") {
          throw error;
        }
      }
    }
    throw new Error("Could not generate a unique task file name.");
  }
  async updateTask(repositoryRoot, taskId, input) {
    const { taskFileName, taskPath, originalValue, originalTask } = await this.readTaskRecord(repositoryRoot, taskId);
    if (!originalTask || !isRecord3(originalValue)) {
      throw new Error("This task is no longer open or has invalid data.");
    }
    const updatedTask = {
      ...originalValue,
      name: input.name,
      projectManagementUrl: input.projectManagementUrl,
      description: input.description
    };
    await this.writeTaskRecord(taskPath, updatedTask);
  }
  async closeTask(repositoryRoot, taskId, now = /* @__PURE__ */ new Date()) {
    const { taskFileName, taskPath, originalValue } = await this.readTaskRecord(repositoryRoot, taskId);
    const task = createTaskSummary(taskFileName, originalValue);
    if (!task || !isRecord3(originalValue)) {
      throw new Error("Task has invalid data.");
    }
    if (task.status === 2) {
      throw new Error("Task is already done.");
    }
    const timeTracking = Array.isArray(originalValue.timeTracking) ? [...originalValue.timeTracking] : [];
    let openEntryIndex = -1;
    for (let index = timeTracking.length - 1; index >= 0 && openEntryIndex < 0; index -= 1) {
      const entry = timeTracking[index];
      if (isRecord3(entry) && entry.endDateTime === null) {
        openEntryIndex = index;
      }
    }
    if (openEntryIndex >= 0) {
      const openEntry = timeTracking[openEntryIndex];
      if (isRecord3(openEntry)) {
        timeTracking[openEntryIndex] = { ...openEntry, endDateTime: toIsoSeconds(now) };
      }
    }
    const updatedTask = {
      ...originalValue,
      status: 2,
      timeTracking
    };
    await this.writeTaskRecord(taskPath, updatedTask);
    const savedTask = createTaskSummary(taskFileName, updatedTask);
    if (!savedTask) {
      throw new Error("Could not read the updated task.");
    }
    return savedTask;
  }
  async toggleTimeTracking(repositoryRoot, taskId, now = /* @__PURE__ */ new Date()) {
    const { taskFileName, taskPath, originalValue } = await this.readTaskRecord(repositoryRoot, taskId);
    const task = createTaskSummary(taskFileName, originalValue);
    if (!task || !isRecord3(originalValue)) {
      throw new Error("Task has invalid data.");
    }
    const entries = Array.isArray(originalValue.timeTracking) ? [...originalValue.timeTracking] : [];
    const lastEntry = entries.at(-1);
    if (isRecord3(lastEntry) && lastEntry.endDateTime === null) {
      entries[entries.length - 1] = { ...lastEntry, endDateTime: toIsoSeconds(now) };
    } else {
      const user = await this.requireGitUserEmail(repositoryRoot);
      entries.push({ startDateTime: toIsoSeconds(now), endDateTime: null, user });
    }
    const updatedTask = {
      ...originalValue,
      status: isRecord3(lastEntry) && lastEntry.endDateTime === null ? task.status : 1,
      timeTracking: entries
    };
    await this.writeTaskRecord(taskPath, updatedTask);
    const savedTask = createTaskSummary(taskFileName, updatedTask);
    if (!savedTask) {
      throw new Error("Could not read the updated task.");
    }
    return savedTask;
  }
  async stopTimeTracking(repositoryRoot, taskId, now = /* @__PURE__ */ new Date()) {
    const { taskFileName, taskPath, originalValue } = await this.readTaskRecord(repositoryRoot, taskId);
    const task = createTaskSummary(taskFileName, originalValue);
    if (!task || !isRecord3(originalValue)) {
      throw new Error("Task has invalid data.");
    }
    const timeTracking = Array.isArray(originalValue.timeTracking) ? [...originalValue.timeTracking] : [];
    let openEntryIndex = -1;
    for (let index = timeTracking.length - 1; index >= 0 && openEntryIndex < 0; index -= 1) {
      const entry = timeTracking[index];
      if (isRecord3(entry) && entry.endDateTime === null) {
        openEntryIndex = index;
      }
    }
    if (openEntryIndex < 0) {
      return void 0;
    }
    const openEntry = timeTracking[openEntryIndex];
    if (!isRecord3(openEntry)) {
      return void 0;
    }
    timeTracking[openEntryIndex] = { ...openEntry, endDateTime: toIsoSeconds(now) };
    const updatedTask = { ...originalValue, timeTracking };
    await this.writeTaskRecord(taskPath, updatedTask);
    return createTaskSummary(taskFileName, updatedTask);
  }
  async stopOtherTimeTracking(repositoryRoot, exceptTaskId, now = /* @__PURE__ */ new Date()) {
    const tasks = await this.listOpenTasks(repositoryRoot);
    const activeTasks = tasks.filter(
      (task) => task.id !== exceptTaskId && task.timeTracking.at(-1)?.endDateTime === null
    );
    const stoppedTasks = await Promise.all(
      activeTasks.map((task) => this.stopTimeTracking(repositoryRoot, task.id, now))
    );
    return stoppedTasks.filter((task) => task !== void 0);
  }
  async startAgentTask(repositoryRoot, task, now = /* @__PURE__ */ new Date()) {
    await this.stopOtherTimeTracking(repositoryRoot, task.id, now);
    await this.clearAgentTaskMarkers(repositoryRoot);
    const historyDirectory = this.getAgentHistoryDirectory(repositoryRoot);
    const taskDirectory = import_node_path.default.join(historyDirectory, import_node_path.default.basename(task.id));
    await (0, import_promises.mkdir)(taskDirectory, { recursive: true });
    const context = {
      taskId: task.id,
      taskName: task.name,
      taskFile: import_node_path.default.posix.join(".history", "tasks", task.id),
      startedAtDateTime: toIsoSeconds(now)
    };
    await (0, import_promises.writeFile)(import_node_path.default.join(taskDirectory, ".current"), `${JSON.stringify(context, null, 2)}
`, {
      encoding: "utf8",
      mode: 384
    });
  }
  async stopAgentTask(repositoryRoot, taskId, now = /* @__PURE__ */ new Date()) {
    await this.stopTimeTracking(repositoryRoot, taskId, now);
    await this.clearAgentTaskMarkers(repositoryRoot, taskId);
  }
  async clearAgentTaskMarkers(repositoryRoot, taskId) {
    const markers = await this.listAgentTaskMarkers(repositoryRoot);
    const targetMarkers = markers.filter((marker) => taskId === void 0 || marker.context.taskId === taskId);
    await Promise.all(targetMarkers.map((marker) => (0, import_promises.unlink)(marker.path)));
  }
  async isTracked(repositoryRoot, taskId) {
    const taskFileName = this.validateTaskId(taskId);
    const relativePath = import_node_path.default.posix.join(".history", "tasks", taskFileName);
    try {
      await execFileAsync("git", ["ls-files", "--error-unmatch", "--", relativePath], {
        cwd: repositoryRoot,
        encoding: "utf8",
        windowsHide: true
      });
      return true;
    } catch (error) {
      if (getExitCode(error) === 1) {
        return false;
      }
      throw error;
    }
  }
  async deleteTask(repositoryRoot, taskId) {
    const taskFileName = this.validateTaskId(taskId);
    await (0, import_promises.unlink)(import_node_path.default.join(this.getTaskDirectory(repositoryRoot), taskFileName));
  }
  async readTaskEntries(directory) {
    try {
      return await (0, import_promises.readdir)(directory, { withFileTypes: true });
    } catch (error) {
      if (getErrorCode(error) === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
  async getImplementationTodoPath(repositoryRoot, taskId, createDirectory = false) {
    const validTaskId = this.validateTaskId(taskId);
    const root = await (0, import_promises.realpath)(repositoryRoot);
    const historyDirectory = import_node_path.default.join(root, ".history");
    const agentDirectory = import_node_path.default.join(historyDirectory, "agents");
    const taskDirectory = import_node_path.default.join(agentDirectory, validTaskId);
    if (createDirectory) {
      await (0, import_promises.mkdir)(historyDirectory, { recursive: true });
    }
    const historyRealPath = await realpathIfPresent(historyDirectory);
    if (!historyRealPath) {
      return import_node_path.default.join(taskDirectory, "implementation-todo.json");
    }
    if (historyRealPath !== historyDirectory) {
      throw new Error("Task history directory must not be a symbolic link.");
    }
    if (createDirectory) {
      await (0, import_promises.mkdir)(agentDirectory, { recursive: true });
    }
    const agentRealPath = await realpathIfPresent(agentDirectory);
    if (!agentRealPath) {
      return import_node_path.default.join(taskDirectory, "implementation-todo.json");
    }
    if (agentRealPath !== agentDirectory) {
      throw new Error("Agent history directory must not be a symbolic link.");
    }
    if (createDirectory) {
      await (0, import_promises.mkdir)(taskDirectory, { recursive: true });
    }
    const taskRealPath = await realpathIfPresent(taskDirectory);
    if (!taskRealPath) {
      return import_node_path.default.join(taskDirectory, "implementation-todo.json");
    }
    if (taskRealPath !== taskDirectory) {
      throw new Error("Agent task folder must not be a symbolic link.");
    }
    const filePath = import_node_path.default.join(taskDirectory, "implementation-todo.json");
    const fileRealPath = await realpathIfPresent(filePath);
    if (fileRealPath && fileRealPath !== filePath) {
      throw new Error("Implementation TODO path must not be a symbolic link.");
    }
    return filePath;
  }
  async mutateImplementationTodo(repositoryRoot, taskId, update) {
    const filePath = await this.getImplementationTodoPath(repositoryRoot, taskId, true);
    await this.withTodoWriteLock(filePath, async () => {
      const current = await this.readImplementationTodo(repositoryRoot, taskId);
      const updated = parseImplementationTodo(serializeImplementationTodo(update(current)));
      await this.writeTaskRecord(filePath, updated);
    });
  }
  async withTodoWriteLock(filePath, operation) {
    const previous = this.todoWriteLocks.get(filePath) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.todoWriteLocks.set(filePath, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.todoWriteLocks.get(filePath) === queued) {
        this.todoWriteLocks.delete(filePath);
      }
    }
  }
  getTaskDirectory(repositoryRoot) {
    return import_node_path.default.join(repositoryRoot, ".history", "tasks");
  }
  getAgentHistoryDirectory(repositoryRoot) {
    return import_node_path.default.join(repositoryRoot, ".history", "agents");
  }
  async listAgentTaskMarkers(repositoryRoot) {
    const directory = this.getAgentHistoryDirectory(repositoryRoot);
    const entries = await this.readTaskEntries(directory);
    const taskDirectories = entries.filter((entry) => entry.isDirectory());
    const markerResults = await Promise.all(taskDirectories.map(async (entry) => {
      const markerPath = import_node_path.default.join(directory, entry.name, ".current");
      let content;
      try {
        content = await (0, import_promises.readFile)(markerPath, "utf8");
      } catch (error) {
        if (getErrorCode(error) === "ENOENT") {
          return void 0;
        }
        throw error;
      }
      const value = JSON.parse(content);
      if (!isCurrentAgentTask(value)) {
        throw new Error(`Invalid active task marker: ${markerPath}`);
      }
      return { path: markerPath, context: value };
    }));
    return markerResults.filter((marker) => marker !== void 0);
  }
  async requireGitUserEmail(repositoryRoot) {
    const email = await this.gitEmailProvider(repositoryRoot);
    if (!email) {
      throw new Error("Set your Git email with `git config user.email` before creating tasks or starting time tracking.");
    }
    return email;
  }
  async readTaskRecord(repositoryRoot, taskId) {
    const taskFileName = this.validateTaskId(taskId);
    const taskPath = this.getTaskFilePath(repositoryRoot, taskFileName);
    const content = await (0, import_promises.readFile)(taskPath, "utf8");
    const originalValue = JSON.parse(content);
    const originalTask = createOpenTaskSummary(taskFileName, originalValue);
    return { taskFileName, taskPath, originalValue, originalTask };
  }
  async writeTaskRecord(taskPath, value) {
    const temporaryPath = `${taskPath}.${(0, import_node_crypto.randomBytes)(8).toString("hex")}.tmp`;
    await (0, import_promises.writeFile)(temporaryPath, `${JSON.stringify(value, null, 2)}
`, {
      encoding: "utf8",
      flag: "wx"
    });
    try {
      await (0, import_promises.rename)(temporaryPath, taskPath);
    } catch (error) {
      await (0, import_promises.unlink)(temporaryPath).catch(() => void 0);
      throw error;
    }
  }
  validateTaskId(taskId) {
    if (import_node_path.default.basename(taskId) !== taskId || !taskId.endsWith(".json")) {
      throw new Error("Invalid task file name.");
    }
    return taskId;
  }
};
function getErrorCode(error) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return void 0;
  }
  const { code } = error;
  return typeof code === "string" || typeof code === "number" ? code : void 0;
}
async function realpathIfPresent(filePath) {
  try {
    return await (0, import_promises.realpath)(filePath);
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") {
      return void 0;
    }
    throw error;
  }
}
function matchesAgentOutput(agentId, fileName) {
  const agent = outputAgents.find((candidate) => candidate.id === agentId);
  return agent?.fileName === fileName;
}
function extractOutputSummary(content) {
  const section = /^## Summary[ \t]*\r?\n([\s\S]*?)(?=^#{1,2}[ \t]+|(?![\s\S]))/m.exec(content)?.[1];
  const text = (section ?? content).trim();
  return text.length > 600 ? `${text.slice(0, 597)}...` : text;
}
function getExitCode(error) {
  const code = getErrorCode(error);
  return typeof code === "number" ? code : void 0;
}
function createRandomSuffix() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 15 }, () => alphabet.charAt((0, import_node_crypto.randomInt)(alphabet.length))).join("");
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isCurrentAgentTask(value) {
  return isRecord3(value) && typeof value.taskId === "string" && typeof value.taskName === "string" && typeof value.taskFile === "string" && typeof value.startedAtDateTime === "string";
}
function createEmptyImplementationTodo(now = /* @__PURE__ */ new Date()) {
  return {
    version: 1,
    summary: summarizeImplementationTodo([]),
    plan: "implementation-plan.md",
    planSyncedAt: toIsoSeconds(now),
    groups: []
  };
}
function createTodoId(title) {
  const slug = title.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${slug || "todo"}-${createRandomSuffix().toLowerCase()}`;
}
function validateTodoGroupName(groupName) {
  if (groupName.trim() === "" || groupName.length > 60) {
    throw new Error("TODO group names must contain 1 to 60 characters.");
  }
}
function findTodoItem(groups, itemId) {
  const item = groups.flatMap((group) => group.items).find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error(`Implementation TODO item '${itemId}' could not be found.`);
  }
  return item;
}
function findTodoGroupName(groups, itemId) {
  const group = groups.find((candidate) => candidate.items.some((item) => item.id === itemId));
  if (!group) {
    throw new Error(`Implementation TODO item '${itemId}' could not be found.`);
  }
  return group.name;
}
function ensureTodoItemEditable(current, changes, actor, allowStatusReconciliation) {
  if (actor === "agent" && current.createdBy === "user") {
    throw new Error("Agents cannot edit user-created TODO items.");
  }
  if (actor === "agent" && current.updatedBy === "user" && changes.done !== void 0 && changes.done !== current.done && !allowStatusReconciliation) {
    throw new Error("Agents cannot change a user-set TODO status outside plan reconciliation.");
  }
}
function appendTodoItem(groups, groupName, item) {
  const existingIndex = groups.findIndex((group) => group.name === groupName);
  if (existingIndex < 0) {
    return [...groups, { name: groupName, items: [item] }];
  }
  return groups.map((group, index) => index === existingIndex ? { ...group, items: [...group.items, item] } : group);
}
function mergeRetainedTodoGroups(primaryGroups, retainedGroups) {
  const merged = primaryGroups.map((group) => ({ ...group, items: [...group.items] }));
  for (const retainedGroup of retainedGroups) {
    const target = merged.find((group) => group.name === retainedGroup.name);
    if (!target) {
      merged.push({ name: retainedGroup.name, items: [...retainedGroup.items] });
    }
    if (target) {
      for (const item of retainedGroup.items) {
        if (!target.items.some((candidate) => candidate.id === item.id)) {
          target.items.push(item);
        }
      }
    }
  }
  return merged;
}
function withUpdatedTodo(todo, groups) {
  return { ...todo, groups, summary: summarizeImplementationTodo(groups) };
}
function moveOrUpdateTodoItem(groups, itemId, targetGroupName, updatedItem) {
  const currentGroupName = findTodoGroupName(groups, itemId);
  const destination = targetGroupName ?? currentGroupName;
  validateTodoGroupName(destination);
  if (destination === currentGroupName) {
    return groups.map((group) => group.name === currentGroupName ? { ...group, items: group.items.map((item) => item.id === itemId ? updatedItem : item) } : group);
  }
  const withoutItem = groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.id !== itemId)
  }));
  return appendTodoItem(withoutItem, destination, updatedItem);
}
function reorderTodoGroups(currentGroups, requestedGroups, actor) {
  const currentItems = currentGroups.flatMap((group) => group.items);
  const requestedIds = requestedGroups.flatMap((group) => group.itemIds);
  const requestedIdSet = new Set(requestedIds);
  if (requestedGroups.some((group) => group.name.trim() === "" || group.name.length > 60) || new Set(requestedGroups.map((group) => group.name)).size !== requestedGroups.length || requestedIds.length !== requestedIdSet.size) {
    throw new Error("TODO reorder contains duplicate IDs or invalid group names.");
  }
  const expectedItems = actor === "agent" ? currentItems.filter((item) => item.createdBy !== "user") : currentItems;
  const expectedIds = new Set(expectedItems.map((item) => item.id));
  if (requestedIds.length !== expectedIds.size || requestedIds.some((id) => !expectedIds.has(id))) {
    throw new Error("TODO reorder must include each editable item exactly once.");
  }
  const itemsById = new Map(currentItems.map((item) => [item.id, item]));
  const reordered = requestedGroups.map((group) => ({
    name: group.name,
    items: group.itemIds.map((id) => itemsById.get(id))
  }));
  if (actor === "user") {
    return reordered;
  }
  const protectedGroups = currentGroups.map((group) => ({
    name: group.name,
    items: group.items.filter((item) => item.createdBy === "user")
  })).filter((group) => group.items.length > 0);
  for (const protectedGroup of protectedGroups) {
    let target = reordered.find((group) => group.name === protectedGroup.name);
    if (!target) {
      target = { name: protectedGroup.name, items: [] };
      const oldIndex = currentGroups.findIndex((group) => group.name === protectedGroup.name);
      reordered.splice(Math.min(oldIndex, reordered.length), 0, target);
    }
    const oldGroup = currentGroups.find((group) => group.name === protectedGroup.name);
    for (const protectedItem of protectedGroup.items) {
      const oldIndex = oldGroup.items.findIndex((item) => item.id === protectedItem.id);
      target.items.splice(Math.min(oldIndex, target.items.length), 0, protectedItem);
    }
  }
  return reordered;
}
function syncReviewGroup(currentGroups, source, groupName, drafts, now) {
  const incomingBySource = /* @__PURE__ */ new Map();
  for (const draft of drafts) {
    if (draft.source !== source || incomingBySource.has(draft.sourceRef)) {
      throw new Error("Review TODO items must use unique source references for their review source.");
    }
    incomingBySource.set(draft.sourceRef, draft);
  }
  const existingGroup = currentGroups.find((group) => group.name === groupName);
  const existingReviewItems = existingGroup?.items.filter((item) => item.source === source && item.createdBy !== "user") ?? [];
  const updatedItems = /* @__PURE__ */ new Map();
  for (const existing of existingReviewItems) {
    const draft = incomingBySource.get(existing.sourceRef);
    if (!draft) {
      continue;
    }
    updatedItems.set(existing.sourceRef, {
      ...existing,
      ...draft,
      id: existing.id,
      createdBy: "agent",
      done: existing.updatedBy === "user" ? existing.done : draft.done,
      updatedBy: existing.updatedBy === "user" ? "user" : "agent",
      updatedAt: existing.updatedBy === "user" ? existing.updatedAt : toIsoSeconds(now)
    });
    incomingBySource.delete(existing.sourceRef);
  }
  let groups = currentGroups.map((group) => group.name !== groupName ? group : {
    ...group,
    items: group.items.filter((item) => item.source !== source || item.createdBy === "user" || updatedItems.has(item.sourceRef)).map((item) => updatedItems.get(item.sourceRef) ?? item)
  });
  const additions = Array.from(incomingBySource.values()).map((draft) => ({
    ...draft,
    id: createTodoId(draft.title),
    createdBy: "agent",
    updatedBy: "agent",
    updatedAt: toIsoSeconds(now)
  }));
  if (!groups.some((group) => group.name === groupName)) {
    groups = [...groups, { name: groupName, items: additions }];
  } else {
    groups = groups.map((group) => group.name === groupName ? { ...group, items: [...group.items, ...additions] } : group);
  }
  return groups;
}
async function readGitUserEmail(repositoryRoot) {
  let email;
  try {
    const result = await execFileAsync("git", ["config", "user.email"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      windowsHide: true
    });
    email = result.stdout.trim();
  } catch (error) {
    if (getExitCode(error) === 1) {
      return void 0;
    }
    throw error;
  }
  if (email === "") {
    return void 0;
  }
  return email;
}
function toIsoSeconds(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// src/tasks/tasksViewProvider.ts
var vscode3 = __toESM(require("vscode"));
var import_node_path2 = __toESM(require("node:path"));

// src/tasks/tasksWebviewHtml.ts
var vscode2 = __toESM(require("vscode"));
var import_node_crypto2 = require("node:crypto");
function getTasksWebviewHtml(webview, extensionUri) {
  const nonce = (0, import_node_crypto2.randomBytes)(16).toString("base64");
  const stylesheetUri = webview.asWebviewUri(vscode2.Uri.joinPath(extensionUri, "media", "tasks.css"));
  const scriptUri = webview.asWebviewUri(vscode2.Uri.joinPath(extensionUri, "dist", "tasksView.js"));
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <link rel="stylesheet" href="${stylesheetUri}">
    <title>Tasks</title>
</head>
<body>
    <main id="tasks-view">
        <p id="repository-message" role="status" hidden>Open a Git repository to start working.</p>
        <section id="selected-task-panel" aria-labelledby="selected-task-name" hidden>
            <header id="selected-task-header">
                <h2 id="selected-task-name"></h2>
                <div id="selected-task-actions">
                    <button id="time-tracking-toggle" class="task-action time-tracking-toggle" type="button"></button>
                    <button id="task-status-toggle" class="task-action task-status-toggle" type="button"></button>
                </div>
            </header>
            <p id="task-action-error" role="alert" hidden></p>
            <p id="selected-task-description" class="is-collapsed"></p>
            <button id="description-toggle" type="button" aria-expanded="false" hidden>Show more</button>
            <div id="agent-outputs" aria-label="Agent output"></div>
            <p id="agent-output-error" role="alert" hidden></p>
        </section>
        <section id="task-panel" aria-label="Open tasks" hidden>
            <section id="create-task-panel" aria-labelledby="create-task-heading" hidden>
                <h2 id="create-task-heading">New task</h2>
                <form id="create-task-form" novalidate>
                    <div class="form-field">
                        <label for="task-name">Name <span aria-hidden="true">*</span></label>
                        <input id="task-name" name="name" type="text" autocomplete="off" required aria-describedby="task-name-error">
                        <p id="task-name-error" class="field-error" role="alert" hidden></p>
                    </div>
                    <div class="form-field">
                        <label for="task-url">Project management URL <span aria-hidden="true">*</span></label>
                        <input id="task-url" name="projectManagementUrl" type="url" autocomplete="url" required aria-describedby="task-url-error">
                        <p id="task-url-error" class="field-error" role="alert" hidden></p>
                    </div>
                    <div class="form-field">
                        <label for="task-description">Description <span aria-hidden="true">*</span></label>
                        <textarea id="task-description" name="description" rows="4" required aria-describedby="task-description-error"></textarea>
                        <p id="task-description-error" class="field-error" role="alert" hidden></p>
                    </div>
                    <p id="create-task-error" role="alert" hidden></p>
                    <div class="form-actions">
                        <button id="cancel-create-task" class="secondary-button" type="button">Cancel</button>
                        <button id="create-task-submit" class="primary-button" type="submit">Save</button>
                    </div>
                </form>
            </section>
            <section id="task-list-panel" aria-label="Open tasks">
                <header class="tasks-accordion-header">
                    <button id="tasks-accordion-toggle" type="button" aria-expanded="true">
                        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
                        <span>Open Tasks</span>
                    </button>
                    <div class="accordion-actions">
                        <button id="add-task-button" class="accordion-icon-button" type="button" title="Add task" aria-label="Add task">
                            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>
                        </button>
                        <button id="reload-tasks-button" class="accordion-icon-button" type="button" title="Reload tasks" aria-label="Reload tasks">
                            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 5V2m0 3h-3M13 5a5.5 5.5 0 1 0 1 4"/></svg>
                        </button>
                    </div>
                </header>
                <div id="tasks-accordion-content">
                    <div class="task-search-row">
                        <label class="visually-hidden" for="task-search">Search tasks by name</label>
                        <input id="task-search" type="search" placeholder="Search tasks" autocomplete="off">
                        <button id="creator-filter-toggle" class="creator-filter-toggle is-active" type="button"
                            title="Filter to tasks created by you" aria-label="Filter to tasks created by you" aria-pressed="true">
                            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5" r="2.5"/><path d="M3 14c.3-2.4 2.2-4 5-4s4.7 1.6 5 4"/></svg>
                        </button>
                    </div>
                    <ul id="task-list" aria-live="polite"></ul>
                    <p id="empty-message" role="status" hidden></p>
                </div>
            </section>
            <section id="quick-reference-panel" aria-label="Agent quick reference">
                <header class="tasks-accordion-header">
                    <button id="quick-reference-toggle" class="tasks-accordion-toggle" type="button" aria-expanded="false" aria-controls="quick-reference-content">
                        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
                        <span>Quick Reference</span>
                    </button>
                </header>
                <div id="quick-reference-content" hidden>
                    <section class="quick-reference-agent">
                        <h3>Analyze and Plan</h3>
                        <p>Use to clarify requirements, compare approaches, and save the selected implementation plan and initial TODOs without changing code.</p>
                    </section>
                    <section class="quick-reference-agent">
                        <h3>Implement</h3>
                        <p>Use to implement the selected work, maintain the task TODOs, and run functional and end-to-end checks.</p>
                    </section>
                    <section class="quick-reference-agent">
                        <h3>Logic Review</h3>
                        <p>Use to investigate changed behavior and report only confirmed bugs or regressions.</p>
                        <p class="quick-reference-skills">Skills: <code>logic-review-default</code> validates findings before reporting.</p>
                    </section>
                    <section class="quick-reference-agent">
                        <h3>Code Readability</h3>
                        <p>Use to review clarity and maintainability and propose focused improvements before editing.</p>
                        <p class="quick-reference-skills">Skills: <code>code-readability-default</code> guides the review.</p>
                    </section>
                    <section class="quick-reference-agent">
                        <h3>Document</h3>
                        <p>Use to update repository documentation to reflect verified code and workflow changes.</p>
                        <p class="quick-reference-skills">Skills: <code>documentation-update-default</code> guides documentation updates.</p>
                    </section>
                    <section class="quick-reference-agent">
                        <h3>Code Comments</h3>
                        <p>Use for comment review or comment-only improvements; it does not change executable code.</p>
                        <p class="quick-reference-skills">Skills: <code>code-comment-review</code> reports findings without edits. <code>code-comment-improve</code> applies safe comment-only changes.</p>
                    </section>
                    <section class="quick-reference-agent">
                        <h3>Debug</h3>
                        <p>Use to reproduce a bug, investigate its root cause, apply a minimal fix when requested, and verify it.</p>
                    </section>
                </div>
            </section>
        </section>
    </main>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

// src/tasks/tasksViewProvider.ts
var TasksViewProvider = class _TasksViewProvider {
  constructor(extensionUri, workspaceState, taskRepository = new TaskRepository()) {
    this.extensionUri = extensionUri;
    this.workspaceState = workspaceState;
    this.taskRepository = taskRepository;
  }
  static viewType = "tasks.list";
  static selectedTaskKey = "tasks.selectedTaskId";
  view;
  viewDisposables = [];
  outputWatcher;
  outputWatcherRoot;
  outputRequest = 0;
  resolveWebviewView(view) {
    this.disposeViewListeners();
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode3.Uri.joinPath(this.extensionUri, "dist"),
        vscode3.Uri.joinPath(this.extensionUri, "media")
      ]
    };
    view.webview.html = getTasksWebviewHtml(view.webview, this.extensionUri);
    this.viewDisposables.push(
      view.webview.onDidReceiveMessage((message) => this.handleMessage(message)),
      view.onDidDispose(() => {
        this.view = void 0;
        this.disposeViewListeners();
      })
    );
  }
  dispose() {
    this.view = void 0;
    this.disposeViewListeners();
  }
  async openEditForm(taskId) {
    const repositoryRoot = await this.findCurrentRepositoryRoot();
    if (!repositoryRoot) {
      await this.postMessage({ type: "repositoryUnavailable" });
      return;
    }
    const tasks = await this.taskRepository.listOpenTasks(repositoryRoot);
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      await this.refresh();
      return;
    }
    await this.postMessage({ type: "openEditForm", task });
  }
  async selectTask(taskId) {
    const repositoryRoot = await this.findCurrentRepositoryRoot();
    if (!repositoryRoot) {
      await this.postMessage({ type: "repositoryUnavailable" });
      return;
    }
    const task = await this.taskRepository.getTask(repositoryRoot, taskId);
    if (!task) {
      await this.refresh();
      await this.workspaceState.update(_TasksViewProvider.selectedTaskKey, void 0);
      await this.postMessage({ type: "clearSelectedTask" });
      return;
    }
    await this.taskRepository.stopOtherTimeTracking(repositoryRoot, taskId);
    await this.taskRepository.clearAgentTaskMarkers(repositoryRoot);
    if (hasOpenTimeEntry(task)) {
      await this.taskRepository.startAgentTask(repositoryRoot, task);
    }
    await this.workspaceState.update(_TasksViewProvider.selectedTaskKey, taskId);
    await this.refresh();
  }
  async refresh() {
    const view = this.view;
    if (!view) {
      return;
    }
    try {
      const repositoryRoot = await this.findCurrentRepositoryRoot();
      if (!repositoryRoot) {
        await this.postMessage({ type: "repositoryUnavailable" });
        return;
      }
      this.watchAgentOutputs(repositoryRoot);
      const [tasks, gitUserEmail] = await Promise.all([
        this.taskRepository.listOpenTasks(repositoryRoot),
        this.taskRepository.getGitUserEmail(repositoryRoot)
      ]);
      await this.postMessage({ type: "taskList", tasks, gitUserEmail });
      await this.restoreSelectedTask(repositoryRoot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode3.window.showErrorMessage(`Unable to load tasks: ${message}`);
    }
  }
  async handleMessage(message) {
    if (isWebviewReadyMessage(message)) {
      await this.refresh();
      return;
    }
    if (isRefreshTasksMessage(message)) {
      await this.refresh();
      return;
    }
    if (isViewTodoMessage(message)) {
      try {
        const repositoryRoot = await this.requireRepositoryRoot();
        if (this.workspaceState.get(_TasksViewProvider.selectedTaskKey) !== message.taskId) {
          throw new Error("Select the task before viewing its TODO details.");
        }
        const content = await this.taskRepository.getImplementationTodoItemMarkdown(repositoryRoot, message.taskId, message.itemId);
        const document = await vscode3.workspace.openTextDocument({ language: "markdown", content });
        await vscode3.commands.executeCommand("markdown.showPreview", document.uri);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        void vscode3.window.showErrorMessage(`Unable to preview TODO details: ${detail}`);
      }
      return;
    }
    if (isViewAgentOutputMessage(message)) {
      try {
        const repositoryRoot = await this.requireRepositoryRoot();
        if (this.workspaceState.get(_TasksViewProvider.selectedTaskKey) !== message.taskId) {
          throw new Error("Select the task before viewing its agent output.");
        }
        if (message.fileName === "implementation-todo.json") {
          const content = await this.taskRepository.getImplementationTodoMarkdown(repositoryRoot, message.taskId);
          const document = await vscode3.workspace.openTextDocument({ language: "markdown", content });
          await vscode3.commands.executeCommand("markdown.showPreview", document.uri);
        } else {
          const filePath = await this.taskRepository.getAgentOutputPath(repositoryRoot, message.taskId, message.fileName);
          await vscode3.commands.executeCommand("markdown.showPreview", vscode3.Uri.file(filePath));
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        void vscode3.window.showErrorMessage(`Unable to preview agent output: ${detail}`);
      }
      return;
    }
    if (isSetTodoStatusMessage(message)) {
      try {
        const repositoryRoot = await this.requireRepositoryRoot();
        if (this.workspaceState.get(_TasksViewProvider.selectedTaskKey) !== message.taskId) {
          throw new Error("Select the task before changing its TODO list.");
        }
        await this.taskRepository.setTodoStatus(repositoryRoot, message.taskId, message.itemId, message.done);
        await this.postMessage({ type: "todoStatusResult", taskId: message.taskId, itemId: message.itemId, done: message.done });
        await this.refreshAgentOutputs(repositoryRoot, message.taskId);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await this.postMessage({ type: "todoStatusResult", taskId: message.taskId, itemId: message.itemId, done: message.done, error: detail });
      }
      return;
    }
    if (isCreateTodoMessage(message)) {
      await this.mutateSelectedTaskTodo(message.taskId, async (repositoryRoot) => {
        await this.taskRepository.addImplementationTodoItem(
          repositoryRoot,
          message.taskId,
          message.group,
          message.item,
          "user"
        );
      });
      return;
    }
    if (isUpdateTodoMessage(message)) {
      await this.mutateSelectedTaskTodo(message.taskId, async (repositoryRoot) => {
        await this.taskRepository.updateImplementationTodoItem(
          repositoryRoot,
          message.taskId,
          message.itemId,
          message.group,
          message.changes,
          "user"
        );
      });
      return;
    }
    if (isRemoveTodoMessage(message)) {
      await this.mutateSelectedTaskTodo(message.taskId, async (repositoryRoot) => {
        const todo = await this.taskRepository.readImplementationTodo(repositoryRoot, message.taskId);
        const item = todo.groups.flatMap((group) => group.items).find((candidate) => candidate.id === message.itemId);
        if (!item) {
          throw new Error("Implementation TODO item could not be found.");
        }
        const choice = await vscode3.window.showWarningMessage(
          `Remove TODO "${item.title}"?`,
          { modal: true },
          "Remove"
        );
        if (choice !== "Remove") {
          return false;
        }
        await this.taskRepository.removeImplementationTodoItem(repositoryRoot, message.taskId, message.itemId, "user");
        return true;
      });
      return;
    }
    if (isReorderTodosMessage(message)) {
      await this.mutateSelectedTaskTodo(message.taskId, (repositoryRoot) => this.taskRepository.reorderImplementationTodos(repositoryRoot, message.taskId, message.groups, "user"));
      return;
    }
    if (isSaveTaskMessage(message)) {
      try {
        await this.saveTask(message.input, message.taskId);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await this.postMessage({ type: "createTaskFailed", message: detail });
      }
      return;
    }
    if (isEditTaskMessage(message)) {
      try {
        await this.openEditForm(message.taskId);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        void vscode3.window.showErrorMessage(`Unable to open task: ${detail}`);
      }
      return;
    }
    if (isOpenTaskFileMessage(message)) {
      try {
        await this.openTaskFile(message.taskId);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        void vscode3.window.showErrorMessage(`Unable to open task file: ${detail}`);
      }
      return;
    }
    if (isSelectTaskMessage(message)) {
      try {
        await this.selectTask(message.taskId);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        void vscode3.window.showErrorMessage(`Unable to select task: ${detail}`);
      }
      return;
    }
    if (isTaskActionMessage(message)) {
      try {
        const repositoryRoot = await this.requireRepositoryRoot();
        const currentTask = await this.taskRepository.getTask(repositoryRoot, message.taskId);
        if (!currentTask) {
          throw new Error("Task could not be found.");
        }
        const willStartTimer = !hasOpenTimeEntry(currentTask);
        if (willStartTimer && !await this.taskRepository.getGitUserEmail(repositoryRoot)) {
          throw new Error("Set your Git email with `git config user.email` before starting time tracking.");
        }
        await this.taskRepository.stopOtherTimeTracking(repositoryRoot, message.taskId);
        await this.taskRepository.clearAgentTaskMarkers(repositoryRoot);
        const task = await this.taskRepository.toggleTimeTracking(repositoryRoot, message.taskId);
        if (hasOpenTimeEntry(task)) {
          await this.taskRepository.startAgentTask(repositoryRoot, task);
        }
        await this.refresh();
        await this.postMessage({ type: "taskActionUpdated", task });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await this.postMessage({ type: "taskActionFailed", message: detail });
      }
      return;
    }
    if (isMarkTaskDoneMessage(message)) {
      try {
        await this.markTaskDone(message.taskId);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await this.postMessage({ type: "taskActionFailed", message: detail });
      }
      return;
    }
    if (!isDeleteTaskMessage(message)) {
      return;
    }
    try {
      await this.deleteTask(message.taskId);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void vscode3.window.showErrorMessage(`Unable to delete task: ${detail}`);
    }
  }
  async deleteTask(taskId) {
    const repositoryRoot = await this.findCurrentRepositoryRoot();
    if (!repositoryRoot) {
      await this.postMessage({ type: "repositoryUnavailable" });
      return;
    }
    const openTasks = await this.taskRepository.listOpenTasks(repositoryRoot);
    const task = openTasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      await this.refresh();
      return;
    }
    const isTracked = await this.taskRepository.isTracked(repositoryRoot, task.id);
    if (!isTracked && !await this.confirmUntrackedDeletion(task.name)) {
      return;
    }
    await this.taskRepository.stopAgentTask(repositoryRoot, taskId);
    await this.taskRepository.deleteTask(repositoryRoot, task.id);
    if (this.workspaceState.get(_TasksViewProvider.selectedTaskKey) === taskId) {
      await this.workspaceState.update(_TasksViewProvider.selectedTaskKey, void 0);
      await this.postMessage({ type: "clearSelectedTask" });
    }
    await this.refresh();
  }
  async openTaskFile(taskId) {
    const repositoryRoot = await this.findCurrentRepositoryRoot();
    if (!repositoryRoot) {
      await this.postMessage({ type: "repositoryUnavailable" });
      return;
    }
    const task = await this.taskRepository.getTask(repositoryRoot, taskId);
    if (!task) {
      await this.refresh();
      return;
    }
    const taskUri = vscode3.Uri.file(this.taskRepository.getTaskFilePath(repositoryRoot, taskId));
    const document = await vscode3.workspace.openTextDocument(taskUri);
    await vscode3.window.showTextDocument(document, {
      viewColumn: vscode3.ViewColumn.One,
      preview: true
    });
  }
  async restoreSelectedTask(repositoryRoot) {
    const taskId = this.workspaceState.get(_TasksViewProvider.selectedTaskKey);
    if (!taskId) {
      return;
    }
    const task = await this.taskRepository.getTask(repositoryRoot, taskId);
    if (!task) {
      await this.workspaceState.update(_TasksViewProvider.selectedTaskKey, void 0);
      await this.postMessage({ type: "clearSelectedTask" });
      return;
    }
    if (hasOpenTimeEntry(task)) {
      await this.taskRepository.startAgentTask(repositoryRoot, task);
    }
    await this.postMessage({ type: "selectedTask", task });
    await this.refreshAgentOutputs(repositoryRoot, taskId);
  }
  watchAgentOutputs(repositoryRoot) {
    if (this.outputWatcherRoot === repositoryRoot) {
      return;
    }
    this.outputWatcher?.dispose();
    const watcher = vscode3.workspace.createFileSystemWatcher(
      new vscode3.RelativePattern(repositoryRoot, ".history/agents/*/*.{md,json}")
    );
    this.outputWatcher = watcher;
    this.outputWatcherRoot = repositoryRoot;
    const update = (uri) => {
      const taskId = this.workspaceState.get(_TasksViewProvider.selectedTaskKey);
      if (taskId && import_node_path2.default.dirname(uri.fsPath) === import_node_path2.default.join(repositoryRoot, ".history", "agents", taskId)) {
        void this.refreshAgentOutputs(repositoryRoot, taskId);
      }
    };
    this.viewDisposables.push(watcher.onDidCreate(update), watcher.onDidChange(update), watcher.onDidDelete(update));
  }
  async refreshAgentOutputs(repositoryRoot, taskId) {
    const request = ++this.outputRequest;
    try {
      const groups = await this.taskRepository.listAgentOutputs(repositoryRoot, taskId);
      if (request === this.outputRequest && this.workspaceState.get(_TasksViewProvider.selectedTaskKey) === taskId) {
        await this.postMessage({ type: "agentOutputs", taskId, groups });
      }
    } catch (error) {
      if (request === this.outputRequest && this.workspaceState.get(_TasksViewProvider.selectedTaskKey) === taskId) {
        const detail = error instanceof Error ? error.message : String(error);
        await this.postMessage({ type: "agentOutputs", taskId, groups: [], error: `Unable to load agent output: ${detail}` });
      }
    }
  }
  async mutateSelectedTaskTodo(taskId, mutate) {
    try {
      const repositoryRoot = await this.requireRepositoryRoot();
      if (this.workspaceState.get(_TasksViewProvider.selectedTaskKey) !== taskId) {
        throw new Error("Select the task before changing its TODO list.");
      }
      const changed = await mutate(repositoryRoot);
      await this.postMessage({ type: "todoMutationResult", taskId });
      if (changed !== false) {
        await this.refreshAgentOutputs(repositoryRoot, taskId);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.postMessage({ type: "todoMutationResult", taskId, error: detail });
    }
  }
  async saveTask(input, taskId) {
    const errors = validateTaskInput(input);
    if (Object.keys(errors).length > 0) {
      await this.postMessage({ type: "createTaskValidationError", errors });
      return;
    }
    const repositoryRoot = await this.findCurrentRepositoryRoot();
    if (!repositoryRoot) {
      await this.postMessage({ type: "repositoryUnavailable" });
      return;
    }
    const normalizedInput = {
      name: input.name.trim(),
      projectManagementUrl: input.projectManagementUrl.trim(),
      description: input.description.trim()
    };
    if (taskId) {
      await this.taskRepository.updateTask(repositoryRoot, taskId, normalizedInput);
    } else {
      await this.taskRepository.createTask(repositoryRoot, normalizedInput);
    }
    await this.refresh();
    await this.postMessage({ type: "taskSaved" });
  }
  async confirmUntrackedDeletion(taskName) {
    const choice = await vscode3.window.showWarningMessage(
      `Delete untracked task "${taskName}"?`,
      { modal: true },
      "Delete"
    );
    return choice === "Delete";
  }
  async findCurrentRepositoryRoot() {
    const workspacePath = vscode3.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
      return void 0;
    }
    return this.taskRepository.findRepositoryRoot(workspacePath);
  }
  async requireRepositoryRoot() {
    const repositoryRoot = await this.findCurrentRepositoryRoot();
    if (!repositoryRoot) {
      throw new Error("Open a Git repository to manage tasks.");
    }
    return repositoryRoot;
  }
  async markTaskDone(taskId) {
    const repositoryRoot = await this.requireRepositoryRoot();
    const task = await this.taskRepository.getTask(repositoryRoot, taskId);
    if (!task || task.status === 2) {
      await this.postMessage({ type: "taskActionCancelled" });
      return;
    }
    const choice = await vscode3.window.showWarningMessage(
      `Mark "${task.name}" as done?`,
      { modal: true },
      "Done"
    );
    if (choice !== "Done") {
      await this.postMessage({ type: "taskActionCancelled" });
      return;
    }
    await this.taskRepository.stopOtherTimeTracking(repositoryRoot, taskId);
    const updatedTask = await this.taskRepository.closeTask(repositoryRoot, taskId);
    await this.taskRepository.clearAgentTaskMarkers(repositoryRoot);
    await this.postMessage({ type: "taskActionUpdated", task: updatedTask });
  }
  async postMessage(message) {
    await this.view?.webview.postMessage(message);
  }
  disposeViewListeners() {
    this.outputWatcher?.dispose();
    this.outputWatcher = void 0;
    this.outputWatcherRoot = void 0;
    this.outputRequest += 1;
    const disposables = this.viewDisposables;
    this.viewDisposables = [];
    disposables.forEach((disposable) => disposable.dispose());
  }
};
function hasOpenTimeEntry(task) {
  return task.timeTracking.at(-1)?.endDateTime === null;
}
function isWebviewReadyMessage(message) {
  return typeof message === "object" && message !== null && "type" in message && message.type === "ready";
}
function isViewAgentOutputMessage(message) {
  return typeof message === "object" && message !== null && "type" in message && message.type === "viewAgentOutput" && "taskId" in message && typeof message.taskId === "string" && "fileName" in message && typeof message.fileName === "string";
}
function isViewTodoMessage(message) {
  return isRecordMessage(message) && message.type === "viewTodo" && typeof message.taskId === "string" && typeof message.itemId === "string";
}
function isSetTodoStatusMessage(message) {
  return typeof message === "object" && message !== null && "type" in message && message.type === "setTodoStatus" && "taskId" in message && typeof message.taskId === "string" && "itemId" in message && typeof message.itemId === "string" && "done" in message && typeof message.done === "boolean";
}
function isCreateTodoMessage(message) {
  return isRecordMessage(message) && message.type === "createTodo" && typeof message.taskId === "string" && typeof message.group === "string" && isRecordMessage(message.item);
}
function isUpdateTodoMessage(message) {
  return isRecordMessage(message) && message.type === "updateTodo" && typeof message.taskId === "string" && typeof message.itemId === "string" && typeof message.group === "string" && isRecordMessage(message.changes);
}
function isRemoveTodoMessage(message) {
  return isRecordMessage(message) && message.type === "removeTodo" && typeof message.taskId === "string" && typeof message.itemId === "string";
}
function isReorderTodosMessage(message) {
  return isRecordMessage(message) && message.type === "reorderTodos" && typeof message.taskId === "string" && Array.isArray(message.groups) && message.groups.every((group) => isRecordMessage(group) && typeof group.name === "string" && Array.isArray(group.itemIds) && group.itemIds.every((itemId) => typeof itemId === "string"));
}
function isRecordMessage(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isRefreshTasksMessage(message) {
  return typeof message === "object" && message !== null && "type" in message && message.type === "refreshTasks";
}
function isDeleteTaskMessage(message) {
  if (typeof message !== "object" || message === null || !("type" in message) || !("taskId" in message)) {
    return false;
  }
  return message.type === "deleteTask" && typeof message.taskId === "string";
}
function isSaveTaskMessage(message) {
  if (typeof message !== "object" || message === null || !("type" in message) || !("input" in message)) {
    return false;
  }
  const input = message.input;
  const hasValidInput = typeof input === "object" && input !== null && "name" in input && typeof input.name === "string" && "projectManagementUrl" in input && typeof input.projectManagementUrl === "string" && "description" in input && typeof input.description === "string";
  const hasValidTaskId = !("taskId" in message) || typeof message.taskId === "string";
  return message.type === "saveTask" && hasValidInput && hasValidTaskId;
}
function isEditTaskMessage(message) {
  if (typeof message !== "object" || message === null || !("type" in message) || !("taskId" in message)) {
    return false;
  }
  return message.type === "editTask" && typeof message.taskId === "string";
}
function isOpenTaskFileMessage(message) {
  if (typeof message !== "object" || message === null || !("type" in message) || !("taskId" in message)) {
    return false;
  }
  return message.type === "openTaskFile" && typeof message.taskId === "string";
}
function isSelectTaskMessage(message) {
  if (typeof message !== "object" || message === null || !("type" in message) || !("taskId" in message)) {
    return false;
  }
  return message.type === "selectTask" && typeof message.taskId === "string";
}
function isTaskActionMessage(message) {
  if (typeof message !== "object" || message === null || !("type" in message) || !("taskId" in message)) {
    return false;
  }
  return message.type === "toggleTimeTracking" && typeof message.taskId === "string";
}
function isMarkTaskDoneMessage(message) {
  if (typeof message !== "object" || message === null || !("type" in message) || !("taskId" in message)) {
    return false;
  }
  return message.type === "markTaskDone" && typeof message.taskId === "string";
}

// src/extension.ts
function activate(context) {
  const taskRepository = new TaskRepository();
  const tasksViewProvider = new TasksViewProvider(context.extensionUri, context.workspaceState, taskRepository);
  registerImplementationTodoTools(context, taskRepository);
  context.subscriptions.push(
    tasksViewProvider,
    vscode4.window.registerWebviewViewProvider(TasksViewProvider.viewType, tasksViewProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
