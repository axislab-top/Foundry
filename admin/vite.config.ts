import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { lanDevOrigin } from './scripts/lan-ip.ts';

function logLanUrls() {
  return {
    name: 'foundry-admin-log-lan-urls',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const origin = lanDevOrigin();
        if (origin) {
          console.log(`\n  LAN clients: ${origin}/login`);
          console.log('  Dev PC:      http://localhost:5174/login\n');
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devOrigin = env.VITE_DEV_ORIGIN?.replace(/\/$/, '');
  const devHost = devOrigin ? new URL(devOrigin).hostname : undefined;
  const isProd = mode === 'production';

  return {
    base: isProd ? '/admin/' : '/',
    plugins: [react(), logLanUrls()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            antd: ['antd', '@ant-design/icons'],
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5174,
      strictPort: true,
      // Allow other PCs that open http://<hostname>:5174 (not just IP / localhost).
      allowedHosts: true,
      ...(devHost
        ? {
            hmr: {
              host: devHost,
              port: 5174,
              clientPort: 5174,
            },
          }
        : {}),
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3002',
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 5174,
      allowedHosts: true,
    },
  };
});
