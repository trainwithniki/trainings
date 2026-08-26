import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const trainingPages = ['pilates','body-balance','body-training','zumba','kids-conditioning','strong-body','tae-bo','step-aerobics'];

export default defineConfig({
  base: '/trainings/',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        public: resolve(__dirname, 'trainings.html'),
        admin: resolve(__dirname, 'trainings/admin.html'),
        ...Object.fromEntries(trainingPages.map(slug=>[`training-${slug}`,resolve(__dirname,`trainings/${slug}.html`)])),
      },
    },
  },
});
