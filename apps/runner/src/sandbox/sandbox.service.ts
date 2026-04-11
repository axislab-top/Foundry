import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as k8s from '@kubernetes/client-node';

export interface SandboxSpace {
  sandboxId: string;
  pvcName: string;
  namespace: string;
}

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);

  constructor(private readonly config: ConfigService) {}

  async getOrCreateSpace(
    companyId: string,
    _persistent: boolean,
  ): Promise<SandboxSpace> {
    const mode = this.config.get<'mock' | 'kubernetes'>('RUNNER_EXEC_MODE');
    const ns = this.config.get<string>('RUNNER_K8S_NAMESPACE');
    const pvcName = SandboxService.pvcNameForCompany(companyId);

    if (mode === 'mock') {
      return {
        sandboxId: `sandbox-${companyId}`,
        pvcName,
        namespace: ns,
      };
    }

    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

    try {
      await k8sApi.readNamespacedPersistentVolumeClaim(
        pvcName,
        ns,
        undefined,
        { headers: {} },
      );
    } catch (e: unknown) {
      const code =
        (e as { statusCode?: number })?.statusCode ??
        (e as { response?: { statusCode?: number } })?.response?.statusCode;
      if (code !== 404) {
        throw e;
      }
      this.logger.log(`Creating PVC ${pvcName} in ${ns}`);
      const pvcBody: k8s.V1PersistentVolumeClaim = {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: {
          name: pvcName,
          labels: { 'foundry.io/company-id': companyId },
        },
        spec: {
          accessModes: ['ReadWriteOnce'],
          resources: { requests: { storage: '10Gi' } },
        },
      };
      await k8sApi.createNamespacedPersistentVolumeClaim(
        ns,
        pvcBody,
        undefined,
        undefined,
        undefined,
        undefined,
        { headers: {} },
      );
    }

    return { sandboxId: `sandbox-${companyId}`, pvcName, namespace: ns };
  }

  static pvcNameForCompany(companyId: string): string {
    const safe = companyId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const base = `workspace-${safe}`.slice(0, 63);
    return base;
  }
}
