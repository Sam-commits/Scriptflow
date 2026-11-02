import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths so the build works at https://sam-commits.github.io/Scriptflow/
  base: './',
  plugins: [react()],
  test: { environment: 'jsdom' },
} as any);
