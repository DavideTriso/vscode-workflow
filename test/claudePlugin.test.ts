import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    claudeMarketplaceName,
    claudePluginKey,
    claudePluginName,
    disablePlugin,
    enablePlugin,
    syncClaudePlugin,
    unregisterClaudePlugin,
} from '../src/claude/claudePlugin';

const repositoryRoot = path.resolve(__dirname, '..');

describe('Claude Code plugin registration', () => {
    let workspace: string;
    let extensionPath: string;
    let storagePath: string;
    let claudeConfigDir: string;

    beforeEach(async () => {
        workspace = await mkdtemp(path.join(os.tmpdir(), 'claude-plugin-'));
        extensionPath = path.join(workspace, 'extension');
        storagePath = path.join(workspace, 'storage');
        claudeConfigDir = path.join(workspace, 'claude');
        await mkdir(path.join(extensionPath, 'dist'), { recursive: true });
        await writeFile(path.join(extensionPath, 'dist', 'mcp-server.js'), '// server');
        await mkdir(path.join(extensionPath, 'claude-plugin'), { recursive: true });
        await cpPlugin(path.join(extensionPath, 'claude-plugin'));
    });

    afterEach(async () => {
        await rm(workspace, { recursive: true, force: true });
    });

    const sync = (version = '2.0.0') => syncClaudePlugin({ extensionPath, storagePath, version, claudeConfigDir });
    const readSettings = async () => JSON.parse(await readFile(path.join(claudeConfigDir, 'settings.json'), 'utf8'));

    it('builds a marketplace holding the plugin, MCP bundle, and the extension version', async () => {
        const { marketplacePath } = await sync('2.0.0');
        const marketplace = JSON.parse(await readFile(path.join(marketplacePath, '.claude-plugin', 'marketplace.json'), 'utf8'));
        expect(marketplace.name).toBe(claudeMarketplaceName);
        expect(marketplace.plugins).toEqual([{ name: claudePluginName, source: `./plugins/${claudePluginName}`, version: '2.0.0' }]);

        const pluginPath = path.join(marketplacePath, 'plugins', claudePluginName);
        const manifest = JSON.parse(await readFile(path.join(pluginPath, '.claude-plugin', 'plugin.json'), 'utf8'));
        expect(manifest).toMatchObject({ name: claudePluginName, version: '2.0.0' });
        expect(await readFile(path.join(pluginPath, 'mcp-server.js'), 'utf8')).toBe('// server');
        expect(await readFile(path.join(pluginPath, 'agents', 'logic-review.md'), 'utf8')).toContain('name: logic-review');
    });

    it('launches the MCP server with an absolute Node path instead of relying on PATH', async () => {
        const { marketplacePath } = await syncClaudePlugin({
            extensionPath, storagePath, version: '2.0.0', claudeConfigDir, nodePath: process.execPath,
        });
        const config = JSON.parse(await readFile(path.join(marketplacePath, 'plugins', claudePluginName, '.mcp.json'), 'utf8'));
        expect(config.mcpServers.todos).toEqual({
            command: process.execPath,
            args: ['${CLAUDE_PLUGIN_ROOT}/mcp-server.js'],
            env: { ELECTRON_RUN_AS_NODE: '1' },
        });
    });

    it('rejects a missing or too old Node before touching settings or the marketplace', async () => {
        await expect(syncClaudePlugin({
            extensionPath, storagePath, version: '2.0.0', claudeConfigDir, nodePath: path.join(workspace, 'no-node'),
        })).rejects.toThrow(/Cannot run Node/);

        if (process.platform !== 'win32') {
            const oldNode = path.join(workspace, 'old-node');
            await writeFile(oldNode, '#!/bin/sh\necho 18.19.0\n', { mode: 0o755 });
            await expect(syncClaudePlugin({
                extensionPath, storagePath, version: '2.0.0', claudeConfigDir, nodePath: oldNode,
            })).rejects.toThrow(/Node 20 or newer.*18\.19\.0/);
        }
        await expect(readFile(path.join(claudeConfigDir, 'settings.json'), 'utf8')).rejects.toThrow();
        await expect(readFile(path.join(storagePath, 'claude-marketplace', '.claude-plugin', 'marketplace.json'), 'utf8')).rejects.toThrow();
    });

    it('registers the marketplace and enables the plugin without losing other settings', async () => {
        await mkdir(claudeConfigDir, { recursive: true });
        await writeFile(path.join(claudeConfigDir, 'settings.json'), JSON.stringify({
            model: 'sonnet',
            enabledPlugins: { 'other@market': true },
            extraKnownMarketplaces: { market: { source: { source: 'github', repo: 'a/b' } } },
        }));
        const { marketplacePath } = await sync();
        expect(await readSettings()).toEqual({
            model: 'sonnet',
            enabledPlugins: { 'other@market': true, [claudePluginKey]: true },
            extraKnownMarketplaces: {
                market: { source: { source: 'github', repo: 'a/b' } },
                [claudeMarketplaceName]: { source: { source: 'directory', path: marketplacePath } },
            },
        });
    });

    it('is idempotent and replaces stale plugin files on update', async () => {
        const { marketplacePath } = await sync('1.0.0');
        const stale = path.join(marketplacePath, 'plugins', claudePluginName, 'agents', 'removed.md');
        await writeFile(stale, 'old');
        const first = await readSettings();
        await sync('1.1.0');
        expect(await readSettings()).toEqual(first);
        await expect(readFile(stale)).rejects.toThrow();
    });

    it('refuses to overwrite settings it cannot parse and copies nothing', async () => {
        await mkdir(claudeConfigDir, { recursive: true });
        await writeFile(path.join(claudeConfigDir, 'settings.json'), '{ not json');
        await expect(sync()).rejects.toThrow('Cannot parse');
        expect(await readFile(path.join(claudeConfigDir, 'settings.json'), 'utf8')).toBe('{ not json');
        await expect(readFile(path.join(storagePath, 'claude-marketplace', '.claude-plugin', 'marketplace.json'))).rejects.toThrow();
    });

    it('unregisters only its own entries and drops maps it leaves empty', async () => {
        await sync();
        await unregisterClaudePlugin(claudeConfigDir);
        expect(await readSettings()).toEqual({});

        await mkdir(claudeConfigDir, { recursive: true });
        await writeFile(path.join(claudeConfigDir, 'settings.json'), JSON.stringify({ enabledPlugins: { 'other@market': true } }));
        await sync();
        await unregisterClaudePlugin(claudeConfigDir);
        expect(await readSettings()).toEqual({ enabledPlugins: { 'other@market': true } });
    });

    it('keeps enable and disable symmetrical for pure settings objects', () => {
        expect(disablePlugin(enablePlugin({ theme: 'dark' }, '/m'))).toEqual({ theme: 'dark' });
    });

    it('uses the same identifiers in the standalone uninstall script', async () => {
        const script = await readFile(path.join(repositoryRoot, 'scripts', 'uninstall.js'), 'utf8');
        expect(script).toContain(`'${claudeMarketplaceName}'`);
        expect(script).toContain(`'${claudePluginKey}'`);
        const manifest = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
        expect(manifest.scripts['vscode:uninstall']).toBe('node ./scripts/uninstall.js');
    });
});

async function cpPlugin(destination: string): Promise<void> {
    const { cp } = await import('node:fs/promises');
    await cp(path.join(repositoryRoot, 'claude-plugin'), destination, { recursive: true });
}
