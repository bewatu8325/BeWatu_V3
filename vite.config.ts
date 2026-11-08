import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      // Shown at the bottom of the mobile account menu (lib/appVersion.ts).
      define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? ''),
        __BUILD_ID__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7)),
      },
      plugins: [react(), tailwindcss()],
      resolve: {
        extensions: ['.tsx', '.ts', '.jsx', '.js']
      },
      esbuild: {
        include: /\.(ts|tsx|js|jsx)$/,
        exclude: []
      }
    };
});
