import { pickLanIPv4, lanDevOrigin, CLIENT_DEV_PORT } from "./lan-ip.ts";

const ip = pickLanIPv4();
const origin = lanDevOrigin();

console.log("Foundry Client — LAN access checklist");
console.log("======================================");
console.log("");
console.log("Use this URL on phones / other PCs (IP only, not computer name):");
console.log(origin ? `  ${origin}/` : "  (no LAN IPv4 detected — connect Wi-Fi/Ethernet)");
console.log("");
console.log("On the dev PC itself, use:");
console.log(`  http://localhost:${CLIENT_DEV_PORT}/`);
console.log("");
console.log('Do NOT use these Vite "Network" URLs (virtual adapters, other devices cannot reach them):');
console.log("  http://172.18.x.x:5173");
console.log("  http://172.21.x.x:5173");
console.log("");
console.log("If another PC still spins / fails, run ON THAT PC:");
console.log(`  ping ${ip ?? "<dev-pc-ip>"}`);
console.log(`  curl ${origin ?? "http://<dev-pc-ip>:5173"}/`);
console.log("");
console.log("Interpretation:");
console.log("  ping/curl fail  -> router AP isolation or wrong Wi-Fi segment (not Vite)");
console.log("  curl OK, browser spins -> clear site data and retry");
console.log("");
console.log('Router fixes (common): disable "AP isolation" / "无线隔离" / "访客网络隔离".');
console.log("");
console.log("Start dev server for all LAN clients:");
console.log("  pnpm dev:lan");
console.log("");
console.log("Open Windows firewall (admin PowerShell on dev PC):");
console.log(
  `  netsh advfirewall firewall add rule name="Foundry Client ${CLIENT_DEV_PORT}" dir=in action=allow protocol=TCP localport=${CLIENT_DEV_PORT} profile=private,public`,
);
