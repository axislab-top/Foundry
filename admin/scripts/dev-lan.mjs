import { spawn } from 'node:child_process';
import { lanDevOrigin } from './lan-ip.ts';

const origin = lanDevOrigin();
if (!origin) {
  console.error('No LAN IPv4 address found. Connect Wi-Fi/Ethernet and retry.');
  process.exit(1);
}

console.log(`Starting admin for LAN devices at ${origin}/login`);
console.log('On this dev PC, keep using http://localhost:5174/login');

const child = spawn('pnpm', ['exec', 'vite'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    VITE_DEV_ORIGIN: origin,
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
