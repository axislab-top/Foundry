import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as k8s from '@kubernetes/client-node';

export interface RunCommandParams {
  companyId: string;
  runId: string;
  commandLine: string;
  pvcName: string;
  namespace: string;
}

export interface RunCommandResult {
  jobName: string;
  namespace: string;
  mode: 'mock' | 'kubernetes';
}

@Injectable()
export class GvisorJobRunner {
  private readonly logger = new Logger(GvisorJobRunner.name);

  constructor(private readonly config: ConfigService) {}

  async runCommand(params: RunCommandParams): Promise<RunCommandResult> {
    const mode = this.config.get<'mock' | 'kubernetes'>('RUNNER_EXEC_MODE');
    if (mode === 'mock') {
      const jobName = `runner-mock-${params.runId.slice(0, 8)}`;
      this.logger.log({
        msg: 'mock_job',
        jobName,
        companyId: params.companyId,
        runId: params.runId,
      });
      return { jobName, namespace: params.namespace, mode: 'mock' };
    }

    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    const batch = kc.makeApiClient(k8s.BatchV1Api);

    const jobName = `runner-exec-${params.runId.slice(0, 8)}-${Date.now()}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 63);

    const image = this.config.get<string>('RUNNER_JOB_IMAGE');
    const runtimeClass = this.config.get<string>('RUNNER_GVISOR_RUNTIME_CLASS');
    const deadline =
      this.config.get<number>('RUNNER_JOB_ACTIVE_DEADLINE_SEC') ?? 3600;

    const job: k8s.V1Job = {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: {
        name: jobName,
        namespace: params.namespace,
        labels: {
          'foundry.io/company-id': params.companyId,
          'foundry.io/run-id': params.runId,
        },
      },
      spec: {
        ttlSecondsAfterFinished: 600,
        backoffLimit: 0,
        activeDeadlineSeconds: deadline,
        template: {
          metadata: {
            labels: {
              'foundry.io/company-id': params.companyId,
              'foundry.io/run-id': params.runId,
            },
          },
          spec: {
            runtimeClassName: runtimeClass,
            restartPolicy: 'Never',
            securityContext: {
              runAsNonRoot: true,
              runAsUser: 65534,
              runAsGroup: 65534,
              fsGroup: 65534,
            },
            containers: [
              {
                name: 'exec',
                image,
                command: ['/bin/sh', '-c', params.commandLine],
                workingDir: '/workspace',
                securityContext: {
                  allowPrivilegeEscalation: false,
                  readOnlyRootFilesystem: false,
                },
                volumeMounts: [
                  { name: 'workspace', mountPath: '/workspace' },
                ],
              },
            ],
            volumes: [
              {
                name: 'workspace',
                persistentVolumeClaim: { claimName: params.pvcName },
              },
            ],
          },
        },
      },
    };

    await batch.createNamespacedJob(
      params.namespace,
      job,
      undefined,
      undefined,
      undefined,
      undefined,
      { headers: {} },
    );

    this.logger.log({ msg: 'job_created', jobName, namespace: params.namespace });
    return { jobName, namespace: params.namespace, mode: 'kubernetes' };
  }
}
