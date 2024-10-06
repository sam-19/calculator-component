import { defineConfig } from 'vite'
import { resolve } from 'path'
import { fileURLToPath, URL } from 'url'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
    mode: 'production',
    build: {
        lib: {
            entry: resolve(__dirname, './src/index.ts'),
            name: 'CalculatorComponent',
            fileName: 'calculator-component',
        },
        minify: 'esbuild',
        outDir: resolve(__dirname, 'umd'),
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
