import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/openvdb/',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        babylon: 'babylon.html',
      },
    },
  },
});
