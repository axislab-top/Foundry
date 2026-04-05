import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Verifier } from '@pact-foundation/pact';
import { createPactRpcHarness } from './pact-rpc-harness.js';

function resolvePactDir(): string {
  if (existsSync(path.resolve(process.cwd(), 'contracts/pact'))) {
    return path.resolve(process.cwd(), 'contracts/pact/pacts');
  }
  return path.resolve(process.cwd(), '../../contracts/pact/pacts');
}

const skipWhenGenerating = process.env.PACT_GENERATE === '1';
const pv = skipWhenGenerating ? describe.skip : describe;

pv('Pact provider verification (foundry-api)', () => {
  it('verifies HTTP shim contracts from foundry-worker', async () => {
    const pactDir = resolvePactDir();
    mkdirSync(pactDir, { recursive: true });
    const pactFile = path.join(pactDir, 'foundry-worker-foundry-api.json');
    if (!existsSync(pactFile)) {
      throw new Error(
        `Missing ${pactFile}. Run: PACT_GENERATE=1 pnpm --filter @service/api run pact:generate`,
      );
    }

    const harness = await createPactRpcHarness();
    try {
      const baseUrl = `http://127.0.0.1:${harness.port}`;
      const brokerUrl = process.env.PACT_BROKER_BASE_URL;
      await new Verifier({
        provider: 'foundry-api',
        providerBaseUrl: baseUrl,
        pactUrls: [pactFile],
        providerVersion: process.env.GITHUB_SHA || process.env.PACT_PROVIDER_VERSION || 'dev',
        ...(brokerUrl
          ? {
              publishVerificationResult: true,
              pactBrokerUrl: brokerUrl,
              pactBrokerToken: process.env.PACT_BROKER_TOKEN,
            }
          : {}),
        logLevel: 'info' as const,
        stateHandlers: {
          'tenant and admin for pact': async () => {
            /* harness stubs memberships as owner */
          },
        },
      }).verifyProvider();
    } finally {
      await harness.close();
    }
  }, 120_000);
});
