import { spawn } from "node:child_process";
import { lanDevOrigin } from "./lan-ip.ts";

const origin = lanDevOrigin();
if (!origin) {
  console.error("No LAN IPv4 address found. Connect Wi-Fi/Ethernet and retry.");
  process.exit(1);
}

const wsUrl = origin.replace(/^http/i, "ws") + "/ws";

console.log(`Starting client for LAN devices at ${origin}/`);
console.log("On this dev PC, keep using http://localhost:5173/");
console.log(`WebSocket (LAN): ${wsUrl}`);

const child = spawn("pnpm", ["exec", "vite"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    VITE_DEV_ORIGIN: origin,
    VITE_WS_URL: wsUrl,
  },
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
