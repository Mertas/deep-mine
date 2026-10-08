import * as esbuild from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';

function copyDir(src, dest) {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function copyStatic() {
  const htmlSrc = 'client/index.html';
  const htmlDest = 'dist/client/index.html';
  mkdirSync(dirname(htmlDest), { recursive: true });
  copyFileSync(htmlSrc, htmlDest);

  const stylesSrc = 'client/src/styles';
  if (existsSync(stylesSrc)) {
    copyDir(stylesSrc, 'dist/client/styles');
  }
  console.log('[client] static files copied');
}

const target = process.argv[2]; // 'client' | 'server' | undefined (both)
const watch = process.argv.includes('--watch');

async function buildClient() {
  const ctx = await esbuild.context({
    entryPoints: ['client/src/main.ts'],
    bundle: true,
    outfile: 'dist/client/main.js',
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    sourcemap: true,
    minify: !watch,
    loader: { '.ts': 'ts' },
  });

  if (watch) {
    console.log('[client] watching for changes...');
    copyStatic();
    await ctx.watch();
  } else {
    console.log('[client] building...');
    await ctx.rebuild();
    await ctx.dispose();
    copyStatic();
    console.log('[client] done');
  }
}

async function buildServer() {
  const ctx = await esbuild.context({
    entryPoints: ['server/src/index.ts'],
    bundle: true,
    outfile: 'dist/server/index.js',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    sourcemap: true,
    minify: false,
    external: ['@tensorflow/tfjs', 'better-sqlite3'],
    loader: { '.ts': 'ts' },
  });

  if (watch) {
    console.log('[server] watching for changes...');
    await ctx.watch();
  } else {
    console.log('[server] building...');
    await ctx.rebuild();
    await ctx.dispose();
    console.log('[server] done');
  }
}

async function main() {
  if (target === 'client') {
    await buildClient();
  } else if (target === 'server') {
    await buildServer();
  } else {
    await Promise.all([buildClient(), buildServer()]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
