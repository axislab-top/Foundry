import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { lanDevOrigin } from "./scripts/lan-ip";

function logLanUrls() {
  return {
    name: "foundry-client-log-lan-urls",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const origin = lanDevOrigin();
        if (origin) {
          console.log(`\n  LAN clients: ${origin}/`);
          console.log("  Dev PC:      http://localhost:5173/\n");
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devOrigin = env.VITE_DEV_ORIGIN?.replace(/\/$/, "");
  const devHost = devOrigin ? new URL(devOrigin).hostname : undefined;
  const apiProxyTarget = env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:3002";
  const repoRoot = path.resolve(__dirname, "..");
  const foundryContractsTypes = path.resolve(repoRoot, "packages/contracts/types");

  return {
    plugins: [react(), logLanUrls()],
    resolve: {
      alias: [
        {
          find: /^@contracts\/types\/(.+)$/,
          replacement: `${foundryContractsTypes}/$1`,
        },
        {
          find: "@contracts/types",
          replacement: path.resolve(repoRoot, "contracts/types"),
        },
        {
          find: "@foundry/contracts",
          replacement: path.resolve(repoRoot, "packages/contracts"),
        },
        {
          find: "@",
          replacement: path.resolve(__dirname, "src"),
        },
        {
          find: "react",
          replacement: path.resolve(__dirname, "node_modules/react"),
        },
        {
          find: "react-dom",
          replacement: path.resolve(__dirname, "node_modules/react-dom"),
        },
      ],
      dedupe: ["react", "react-dom"],
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      allowedHosts: true,
      ...(devHost
        ? {
            hmr: {
              host: devHost,
              port: 5173,
              clientPort: 5173,
            },
          }
        : {}),
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        "/socket.io": {
          target: apiProxyTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    preview: {
      host: "0.0.0.0",
      port: 5173,
      allowedHosts: true,
    },
    test: {
      environment: "node",
      include: ["src/**/*.spec.ts"],
      globals: true,
    },
  };
});
