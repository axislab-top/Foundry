import os from "node:os";

const PORT = 5173;

/** Prefer real Wi-Fi/LAN 192.168.x; skip Hyper-V / Docker virtual adapters. */
export function pickLanIPv4(): string | undefined {
  const candidates: Array<{ name: string; address: string }> = [];
  for (const [name, ifaces] of Object.entries(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      const lower = name.toLowerCase();
      if (lower.includes("vethernet") || lower.includes("hyper-v") || lower.includes("wsl")) {
        continue;
      }
      candidates.push({ name, address: iface.address });
    }
  }

  const preferred = candidates.find((item) => item.address.startsWith("192.168."));
  return preferred?.address ?? candidates[0]?.address;
}

export function lanDevOrigin(): string | undefined {
  const ip = pickLanIPv4();
  return ip ? `http://${ip}:${PORT}` : undefined;
}

export const CLIENT_DEV_PORT = PORT;
