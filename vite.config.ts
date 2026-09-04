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
      emptyOutDir: true, // Only empties dist/webview
      rollupOptions: {
        input: 'src/webview/main.ts',
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name].[ext]',
        },
      },
      sourcemap: true,
    },
  };
});