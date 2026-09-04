import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { builtinModules } from 'module';

export default defineConfig(({ mode }) => {
  // Extension build (Node.js)
  if (mode === 'extension') {
    return {
      build: {
        outDir: 'dist',
        lib: {
          entry: 'src/extension/extension.ts',
          formats: ['cjs'],
          fileName: () => 'extension.js',
        },
        rollupOptions: {
          external: [
            'vscode',
            // Mark all Node.js built-ins as external
            ...builtinModules,
            // Also mark prefixed versions (node:fs, node:path, etc.)
            ...builtinModules.map((m) => `node:${m}`),
          ],
        },
        sourcemap: true,
      },
    };
  }

  // Webview build (browser)
  return {
    plugins: [svelte()],
    build: {
      outDir: 'dist/webview',
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