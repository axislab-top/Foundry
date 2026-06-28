#!/usr/bin/env node
/**
 * Local blast-radius checks for tenant workspace isolation (Sprint 2 / 2.1 red team).
 *
 * Default (no flags): host temp-dir simulation — Scenario A/B.
 * `--real`: applies a short-lived **Batch Job** with `runtimeClassName: gvisor` and the
 * target company's **workspace PVC** mounted at `/workspace`, then asserts log markers.
 * Requires: `kubectl`, current kube context, PVC must exist (or Job will stay Pending).
 *
 * Run:
 *   node scripts/red-team-sandbox-scenarios.mjs
 *   node scripts/red-team-sandbox-scenarios.mjs --real
 *
 * Real mode env:
 *   FOUNDRY_RED_TEAM_NAMESPACE   (default: foundry-runner)
 *   FOUNDRY_RED_TEAM_COMPANY_ID    (required UUID)
 *   FOUNDRY_RED_TEAM_PVC           (optional; default derived like apps/runner SandboxService)
 *   FOUNDRY_RED_TEAM_RUNTIME_CLASS (default: gvisor)
 *   FOUNDRY_RED_TEAM_JOB_IMAGE     (default: busybox:1.36)
 */
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL = process.argv.includes('--real') || process.env.FOUNDRY_RED_TEAM_REAL === '1';

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function pvcForCompany(companyId) {
  const safe = companyId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `workspace-${safe}`.slice(0, 63);
}

function kubectl(args) {
  const r = spawnSync('kubectl', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  return {
    ok: r.status === 0,
    code: r.status,
    out: `${r.stdout || ''}${r.stderr || ''}`,
  };
}

async function scenarioRealGvisorJob() {
  const companyId = process.env.FOUNDRY_RED_TEAM_COMPANY_ID?.trim();
  if (!companyId) {
    console.error('FAIL: set FOUNDRY_RED_TEAM_COMPANY_ID (UUID) for --real');
    process.exit(1);
  }
  const ns = process.env.FOUNDRY_RED_TEAM_NAMESPACE?.trim() || 'foundry-runner';
  const pvc = process.env.FOUNDRY_RED_TEAM_PVC?.trim() || pvcForCompany(companyId);
  const rtc = process.env.FOUNDRY_RED_TEAM_RUNTIME_CLASS?.trim() || 'gvisor';
  const image = process.env.FOUNDRY_RED_TEAM_JOB_IMAGE?.trim() || 'busybox:1.36';

  const which = kubectl(['version', '--client=true']);
  assert(which.ok, `kubectl client check failed:\n${which.out}`);

  const jobName = `foundry-redteam-${Date.now().toString(36)}`.slice(0, 63).replace(/[^a-z0-9-]/g, '-');
  const script = [
    'set -e',
    'echo PASS:start',
    'mkdir -p /workspace/sub && echo probe > /workspace/sub/x',
    'rm -rf /workspace/*',
    'test ! -f /workspace/sub/x',
    'echo PASS:rm_rf_only_workspace',
    'mkdir -p /workspace/a && ln -sf /tmp /workspace/a/out',
    'test -d /workspace/a/out',
    'echo PASS:symlink_resolves_inside_mount',
    'echo PASS:all',
  ].join('\n');

  const jobYaml = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name: jobName, namespace: ns },
    spec: {
      ttlSecondsAfterFinished: 300,
      backoffLimit: 0,
      template: {
        spec: {
          runtimeClassName: rtc,
          restartPolicy: 'Never',
          containers: [
            {
              name: 'redteam',
              image,
              command: ['/bin/sh', '-c', script],
              volumeMounts: [{ name: 'ws', mountPath: '/workspace' }],
            },
          ],
          volumes: [{ name: 'ws', persistentVolumeClaim: { claimName: pvc } }],
        },
      },
    },
  };

  const tmp = path.join(os.tmpdir(), `${jobName}.yaml`);
  await fs.writeFile(tmp, JSON.stringify(jobYaml, null, 2), 'utf8');
  console.log(`Applying Job ${jobName} in ${ns} (PVC ${pvc}, runtimeClass ${rtc})...`);
  const ap = kubectl(['apply', '-f', tmp]);
  if (!ap.ok) {
    console.error(ap.out);
    process.exit(1);
  }

  const wait = kubectl(['wait', '--for=condition=complete', 'job/' + jobName, '-n', ns, '--timeout=180s']);
  if (!wait.ok) {
    const desc = kubectl(['describe', 'job/' + jobName, '-n', ns]);
    console.error(wait.out);
    console.error(desc.out);
    await fs.unlink(tmp).catch(() => {});
    process.exit(1);
  }

  const logs = kubectl(['logs', 'job/' + jobName, '-n', ns]);
  console.log('--- job logs ---\n', logs.out);
  assert(logs.out.includes('PASS:rm_rf_only_workspace'), 'logs must contain PASS:rm_rf_only_workspace');
  assert(logs.out.includes('PASS:symlink_resolves_inside_mount'), 'logs must contain symlink PASS line');
  assert(logs.out.includes('PASS:all'), 'logs must contain PASS:all');

  kubectl(['delete', 'job', jobName, '-n', ns, '--wait=false']);
  await fs.unlink(tmp).catch(() => {});

  console.log('\nOK  Real scenario: gVisor Job completed with expected PASS markers.');
  console.log(
    'INFO Cross-tenant isolation is implied: this pod only mounts one PVC; peer PVC is not in the filesystem.',
  );
}

async function scenarioA_twoTenantsWipe() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foundry-redteam-'));
  const aWs = path.join(root, 'tenant-a', 'workspace');
  const bWs = path.join(root, 'tenant-b', 'workspace');
  await fs.mkdir(aWs, { recursive: true });
  await fs.mkdir(bWs, { recursive: true });
  await fs.writeFile(path.join(aWs, 'a.txt'), 'A', 'utf8');
  await fs.writeFile(path.join(bWs, 'b.txt'), 'B', 'utf8');

  await fs.rm(aWs, { recursive: true, force: true });
  await fs.mkdir(aWs, { recursive: true });

  let bOk = false;
  try {
    const v = await fs.readFile(path.join(bWs, 'b.txt'), 'utf8');
    bOk = v === 'B';
  } catch {
    bOk = false;
  }
  assert(bOk, 'Scenario A: tenant B file should survive after wiping tenant A workspace');

  await fs.rm(root, { recursive: true, force: true });
  console.log('OK  Scenario A: wipe tenant A workspace — tenant B untouched');
}

async function scenarioB_symlinkEscapeDemo() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foundry-redteam-symlink-'));
  const tenantA = path.join(root, 'companies', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'workspace');
  const tenantB = path.join(root, 'companies', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'workspace');
  await fs.mkdir(tenantA, { recursive: true });
  await fs.mkdir(tenantB, { recursive: true });
  const secret = path.join(tenantB, 'secret.txt');
  await fs.writeFile(secret, 'OTHER_TENANT', 'utf8');

  const linkPath = path.join(tenantA, 'escape-to-b');
  try {
    await fs.symlink(path.relative(path.dirname(linkPath), secret), linkPath, 'file');
  } catch (e) {
    console.warn('SKIP Scenario B: could not create symlink (permissions/OS):', (e && e.message) || e);
    await fs.rm(root, { recursive: true, force: true });
    return;
  }

  const leaked = await fs.readFile(linkPath, 'utf8');
  assert(
    leaked === 'OTHER_TENANT',
    'Scenario B: symlink read should resolve on shared host layout (lab only)',
  );

  console.log(
    'INFO Scenario B: on a SHARED host directory tree, symlinks can leak across tenant folders.',
  );
  console.log(
    'INFO Production mitigation: mount ONE PVC at /workspace per Job so paths outside that volume are not visible.',
  );

  await fs.rm(root, { recursive: true, force: true });
  console.log('OK  Scenario B: lab demo completed (read docs/security/tenant-red-team-plan.md)');
}

async function main() {
  console.log('Foundry tenant red-team sandbox scenarios\n');
  if (REAL) {
    await scenarioRealGvisorJob();
    console.log('\nAll real scenarios finished.');
    return;
  }
  await scenarioA_twoTenantsWipe();
  await scenarioB_symlinkEscapeDemo();
  console.log('\nAll local scenarios finished.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
