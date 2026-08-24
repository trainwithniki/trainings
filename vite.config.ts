import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/trainings/',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        public: resolve(__dirname, 'trainings.html'),
        admin: resolve(__dirname, 'trainings/admin.html'),
      },
    },
  },
});
