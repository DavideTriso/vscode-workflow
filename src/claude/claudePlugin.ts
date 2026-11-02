import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const claudePluginName = 'vscode-workflow';
export const claudeMarketplaceName = 'vscode-workflow-local';
export const claudePluginKey = `${claudePluginName}@${claudeMarketplaceName}`;

const execFileAsync = promisify(execFile);

/** The bundled MCP server targets Node 20 (see esbuild.mjs). */
export const minimumNodeMajor = 20;

export interface ClaudePluginSyncOptions {
    /** Extension install folder holding `claude-plugin/` and `dist/mcp-server.js`. */
    extensionPath: string;
    /** Stable folder owned by the extension; survives extension updates, unlike `extensionPath`. */
    storagePath: string;
    /** Extension version, stamped into the plugin so Claude Code sees updates. */
    version: string;
    claudeConfigDir?: string;
    /** Node binary that launches the MCP server; defaults to the one running the extension. */
    nodePath?: string;
}

export interface ClaudePluginSyncResult {
    marketplacePath: string;
    settingsPath: string;
}

export function resolveClaudeConfigDir(env: NodeJS.ProcessEnv = process.env): string {
    return env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

/**
 * Copies the bundled plugin to a stable local marketplace and enables it in the user's Claude Code settings.
 * Idempotent: safe to run on every activation and after every extension update.
 */
export async function syncClaudePlugin(options: ClaudePluginSyncOptions): Promise<ClaudePluginSyncResult> {
    const settingsPath = join(options.claudeConfigDir ?? resolveClaudeConfigDir(), 'settings.json');
    const marketplacePath = join(options.storagePath, 'claude-marketplace');
    // Read settings first so malformed user settings abort before anything is copied.
    const settings = await readSettings(settingsPath);
    const nodePath = options.nodePath ?? process.execPath;
    await assertUsableNode(nodePath);

    await writeMarketplace(options, marketplacePath);
    await writeSettings(settingsPath, enablePlugin(settings, marketplacePath));
    return { marketplacePath, settingsPath };
}

/** Removes only this extension's entries from the user's Claude Code settings. */
export async function unregisterClaudePlugin(claudeConfigDir = resolveClaudeConfigDir()): Promise<void> {
    const settingsPath = join(claudeConfigDir, 'settings.json');
    const settings = await readSettings(settingsPath);
    const next = disablePlugin(settings);
    if (JSON.stringify(next) !== JSON.stringify(settings)) {
        await writeSettings(settingsPath, next);
    }
}

export function enablePlugin(settings: Record<string, unknown>, marketplacePath: string): Record<string, unknown> {
    return {
        ...settings,
        extraKnownMarketplaces: {
            ...asRecord(settings.extraKnownMarketplaces),
            [claudeMarketplaceName]: { source: { source: 'directory', path: marketplacePath } },
        },
        enabledPlugins: { ...asRecord(settings.enabledPlugins), [claudePluginKey]: true },
    };
}

export function disablePlugin(settings: Record<string, unknown>): Record<string, unknown> {
    const next = { ...settings };
    const marketplaces = { ...asRecord(settings.extraKnownMarketplaces) };
    const plugins = { ...asRecord(settings.enabledPlugins) };
    delete marketplaces[claudeMarketplaceName];
    delete plugins[claudePluginKey];
    setOrDrop(next, 'extraKnownMarketplaces', marketplaces);
    setOrDrop(next, 'enabledPlugins', plugins);
    return next;
}

async function writeMarketplace(options: ClaudePluginSyncOptions, marketplacePath: string): Promise<void> {
    const pluginPath = join(marketplacePath, 'plugins', claudePluginName);
    await rm(marketplacePath, { recursive: true, force: true });
    await mkdir(join(marketplacePath, '.claude-plugin'), { recursive: true });
    await cp(join(options.extensionPath, 'claude-plugin'), pluginPath, { recursive: true });
    await cp(join(options.extensionPath, 'dist', 'mcp-server.js'), join(pluginPath, 'mcp-server.js'));

    const manifestPath = join(pluginPath, '.claude-plugin', 'plugin.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    await writeFile(manifestPath, `${JSON.stringify({ ...manifest, version: options.version }, null, 4)}\n`);

    await writeMcpConfig(pluginPath, options.nodePath ?? process.execPath);

    const marketplace = {
        name: claudeMarketplaceName,
        description: 'Local marketplace managed by the VS Code Workflow extension.',
        owner: { name: 'VS Code Workflow' },
        plugins: [{ name: claudePluginName, source: `./plugins/${claudePluginName}`, version: options.version }],
    };
    await writeFile(join(marketplacePath, '.claude-plugin', 'marketplace.json'), `${JSON.stringify(marketplace, null, 4)}\n`);
}

/** Fails before anything is copied when the Node binary cannot run the bundled MCP server. */
export async function assertUsableNode(nodePath: string): Promise<void> {
    let output: string;
    try {
        ({ stdout: output } = await execFileAsync(nodePath, ['-p', 'process.versions.node'], {
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
            timeout: 10_000,
        }));
    } catch (error) {
        throw new Error(`Cannot run Node at ${nodePath} for the Claude Code MCP server: ${error instanceof Error ? error.message : String(error)}`);
    }
    const version = output.trim();
    if (Number.parseInt(version, 10) < minimumNodeMajor) {
        throw new Error(`The Claude Code MCP server needs Node ${minimumNodeMajor} or newer, but ${nodePath} is Node ${version}.`);
    }
}

/**
 * Pins the server to an absolute Node binary: Claude Code may run without `node` on PATH
 * (typical when Node only ships inside VS Code). ELECTRON_RUN_AS_NODE makes the desktop
 * Electron binary behave as plain Node and is ignored by a regular Node.
 */
async function writeMcpConfig(pluginPath: string, nodePath: string): Promise<void> {
    const config = {
        mcpServers: {
            todos: {
                command: nodePath,
                args: ['${CLAUDE_PLUGIN_ROOT}/mcp-server.js'],
                env: { ELECTRON_RUN_AS_NODE: '1' },
            },
        },
    };
    await writeFile(join(pluginPath, '.mcp.json'), `${JSON.stringify(config, null, 4)}\n`);
}

async function readSettings(settingsPath: string): Promise<Record<string, unknown>> {
    let text: string;
    try {
        text = await readFile(settingsPath, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return {};
        }
        throw error;
    }
    if (!text.trim()) {
        return {};
    }
    try {
        return asRecord(JSON.parse(text));
    } catch {
        throw new Error(`Cannot parse ${settingsPath}; fix its JSON so the extension can register the Claude Code plugin.`);
    }
}

async function writeSettings(settingsPath: string, settings: Record<string, unknown>): Promise<void> {
    await mkdir(join(settingsPath, '..'), { recursive: true });
    const temporaryPath = `${settingsPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`);
    await rename(temporaryPath, settingsPath);
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function setOrDrop(target: Record<string, unknown>, key: string, value: Record<string, unknown>): void {
    if (Object.keys(value).length === 0) {
        delete target[key];
        return;
    }
    target[key] = value;
}
