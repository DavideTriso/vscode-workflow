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

if (isWatch) {
    const context = await esbuild.context(extensionOptions);
    await context.watch();
} else {
    await esbuild.build(extensionOptions);
}
