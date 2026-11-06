import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/qmodem-unicom/',
  plugins: [vue(), tailwindcss()],
  define: {
    __APP_BRANCH__: JSON.stringify('qmodem'),
    __APP_COMMIT__: JSON.stringify('35f5646+router'),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
