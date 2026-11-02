// Runs through the `vscode:uninstall` hook. Plain Node, no dependencies: it only removes
// this extension's entries from the user's Claude Code settings. Keep names in sync with
// src/claude/claudePlugin.ts (a test enforces this).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const marketplaceName = 'vscode-workflow-local';
const pluginKey = 'vscode-workflow@vscode-workflow-local';

const settingsPath = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'settings.json');

try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    for (const [key, name] of [['extraKnownMarketplaces', marketplaceName], ['enabledPlugins', pluginKey]]) {
        if (settings[key] && typeof settings[key] === 'object') {
            delete settings[key][name];
            if (Object.keys(settings[key]).length === 0) {
                delete settings[key];
            }
        }
    }
    fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
} catch {
    // Missing or unreadable settings: nothing to clean up, and uninstall must never fail.
}
