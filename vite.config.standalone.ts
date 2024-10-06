import { defineConfig } from 'vite'
import { resolve } from 'path'
import { fileURLToPath, URL } from 'url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
    mode: 'production',
    build: {
        lib: {
            entry: resolve(__dirname, './index.html'),
            name: 'Calculator',
            fileName: 'calculator',
        },
        minify: 'esbuild',
        outDir: resolve(__dirname, 'build'),
        rollupOptions: {
            external: [],
            output: {
                globals: {},
            },
        },
        target: 'esnext',
    },
    esbuild: {
        keepNames: true,
    },
    optimizeDeps: {
        esbuildOptions: {
            target: 'esnext',
        },
     },
    plugins: [
        tsconfigPaths(),
        viteSingleFile(),
    ],
    define: {
        __INTLIFY_JIT_COMPILATION__: true,
        'process.env': process.env,
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
})
