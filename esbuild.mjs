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
  entryPoints: ['src/ui/webview/main.ts'],
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
};

const configurations = [extensionOptions, webviewOptions];

if (isWatch) {
  const contexts = await Promise.all(configurations.map((options) => esbuild.context(options)));
  await Promise.all(contexts.map((context) => context.watch()));
} else {
  await Promise.all(configurations.map((options) => esbuild.build(options)));
}
