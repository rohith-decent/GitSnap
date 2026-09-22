import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { builtinModules } from 'module';

export default defineConfig(({ mode }) => {
  // ── Extension build (Node.js environment) ──
  if (mode === 'extension') {
    return {
      build: {
        target: 'node18',
        outDir: 'dist',
        emptyOutDir: false, // Prevent deleting dist/webview if built first
        lib: {
          entry: 'src/extension/extension.ts',
          formats: ['cjs'],
          fileName: () => 'extension.js',
        },
        rollupOptions: {
          external: [
            'vscode',
            ...builtinModules,
            ...builtinModules.map((m) => `node:${m}`),
          ],
        },
        sourcemap: true,
      },
    };
  }

  // ── Webview build (Browser environment) ──
  return {
    plugins: [svelte()],
    build: {
      target: 'es2020',
      outDir: 'dist/webview',
      emptyOutDir: true, // Cleans dist/webview before bundling browser assets
      sourcemap: true,
      rollupOptions: {
        input: {
          main: 'src/webview/main.ts',
          dashboard: 'src/webview/dashboard-main.ts',
          commitEditor: 'src/webview/commit-editor-main.ts',
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
        },
      },
    },
  };
});