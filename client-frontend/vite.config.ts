import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const gatewayTarget =
    env.VITE_GATEWAY_ORIGIN?.replace(/\/$/, '') || 'http://localhost:3002';

  return {
    plugins: [react()],
    root: '.',
    build: {
      outDir: 'dist',
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: gatewayTarget,
          changeOrigin: true,
          /** 与 Gateway RPC 长超时一致，避免 dev 下慢链路被代理率先断开 */
          timeout: 120_000,
          proxyTimeout: 120_000,
        },
      },
    },
  };
});
