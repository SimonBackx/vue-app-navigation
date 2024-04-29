import path from 'path';
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        vue(),
        dts()
    ],
    build: {
        minify: false,
        lib: { // tell the build process to treat this project as library
            entry: path.resolve(__dirname, './index.ts'),
            name: 'vue-app-navigation',
            fileName: "index",
            formats: ['es'],
        },
        rollupOptions: {
            // make sure to externalize deps that shouldn't be bundled
            // into your library
            external: ['vue'],
            output: {
              // Provide global variables to use in the UMD build
              // for externalized deps
              globals: {
                vue: 'Vue',
              },
              assetFileNames: (assetInfo) => {
                if (assetInfo.name === 'style.css') return 'main.css';
                return assetInfo.name ?? '';
              }
            },
        },
    }
})