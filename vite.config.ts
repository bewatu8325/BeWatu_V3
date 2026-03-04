import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      resolve: {
        extensions: ['.tsx', '.ts', '.jsx', '.js']
      },
      esbuild: {
        include: /\.(ts|tsx|js|jsx)$/,
        exclude: []
      }
    };
});
