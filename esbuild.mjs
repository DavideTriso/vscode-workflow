import * as esbuild from 'esbuild';

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

const sharedOptions = {
    bundle: true,
    sourcemap: !isProduction,
    minify: isProduction,
    logLevel: 'info',
};

const extensionOptions = {
    ...sharedOptions,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
};

const webviewOptions = {
    ...sharedOptions,
    entryPoints: ['src/ui/tasks/main.ts'],
    outfile: 'dist/tasksView.js',
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
};

// Bundled into the Claude Code plugin; launched over stdio by the plugin's .mcp.json.
const mcpServerOptions = {
    ...sharedOptions,
    entryPoints: ['src/mcp/server.ts'],
    outfile: 'dist/mcp-server.js',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
};

const configurations = [extensionOptions, webviewOptions, mcpServerOptions];

if (isWatch) {
    const contexts = await Promise.all(configurations.map((options) => esbuild.context(options)));
    await Promise.all(contexts.map((context) => context.watch()));
} else {
    await Promise.all(configurations.map((options) => esbuild.build(options)));
}
