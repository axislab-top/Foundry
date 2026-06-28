import { Inject, Injectable, Logger } from '@nestjs/common';

import { ClientProxy } from '@nestjs/microservices';

import { firstValueFrom, timeout } from 'rxjs';

import { ConfigService } from '../../common/config/config.service.js';

import type { MappedExecutionArtifact } from '../collaboration/utils/employee-deliverable-artifacts.util.js';

import {

  collectFileRegisterCandidates,

  collectTextContentRegisterCandidates,

} from './register-file-assets-from-artifacts.util.js';



export type RegisteredFileAsset = {

  storagePath?: string;

  fileAssetId: string;

  name: string;

  /** 文本登记时对应 artifacts 下标 */

  artifactIndex?: number;

};



export type RegisterFileAssetsContext = {

  companyId: string;

  agentId: string;

  taskId?: string;

  projectId?: string;

  skillName?: string;

};



@Injectable()

export class FileAssetsRegistrationService {

  private readonly logger = new Logger(FileAssetsRegistrationService.name);



  constructor(

    @Inject('API_RPC_CLIENT') private readonly apiRpc: ClientProxy,

    private readonly config: ConfigService,

  ) {}



  private workerActor() {

    return {

      id: this.config.getWorkerActorUserId(),

      roles: ['admin'] as string[],

    };

  }



  async registerFromArtifacts(

    ctx: RegisterFileAssetsContext,

    artifacts: MappedExecutionArtifact[],

    rawResult: unknown,

  ): Promise<RegisteredFileAsset[]> {

    const pathCandidates = collectFileRegisterCandidates(artifacts, rawResult, ctx.companyId);

    const textCandidates = collectTextContentRegisterCandidates(artifacts, ctx, pathCandidates);

    if (!pathCandidates.length && !textCandidates.length) return [];



    const actor = this.workerActor();

    const memoryNamespace = ctx.agentId ? `agent:${ctx.agentId}` : 'company';

    const registered: RegisteredFileAsset[] = [];



    for (const c of pathCandidates) {

      try {

        const res = await firstValueFrom(

          this.apiRpc

            .send<Record<string, unknown>>('fileAssets.register', {

              companyId: ctx.companyId,

              actor,

              data: {

                storagePath: c.storagePath,

                name: c.name,

                sourceType: 'agent',

                sourceAgentId: ctx.agentId,

                sourceTaskId: ctx.taskId,

                projectId: ctx.projectId,

                category: 'report',

                ingest: c.ingest,

                memoryNamespace,

              },

            })

            .pipe(timeout(this.config.getApiRpcTimeoutMs())),

        );

        const fileAssetId = String(res?.id ?? '').trim();

        if (fileAssetId) {

          registered.push({

            storagePath: c.storagePath,

            fileAssetId,

            name: String(res?.name ?? c.name ?? 'file').trim() || 'file',

          });

        }

      } catch (e: unknown) {

        const msg = e instanceof Error ? e.message : String(e);

        this.logger.warn('fileAssets.register failed', {

          storagePath: c.storagePath,

          taskId: ctx.taskId,

          msg,

        });

      }

    }



    for (const c of textCandidates) {
      // 路径登记已成功时不再重复登记文本（避免双份交付物）
      if (registered.length > 0) break;

      try {

        const res = await firstValueFrom(

          this.apiRpc

            .send<Record<string, unknown>>('fileAssets.registerFromContent', {

              companyId: ctx.companyId,

              actor,

              data: {

                content: c.content,

                name: c.name,

                contentType: c.contentType,

                sourceType: 'agent',

                sourceAgentId: ctx.agentId,

                sourceTaskId: ctx.taskId,

                projectId: ctx.projectId,

                category: 'report',

                ingest: c.ingest,

                memoryNamespace,

              },

            })

            .pipe(timeout(this.config.getApiRpcTimeoutMs())),

        );

        const fileAssetId = String(res?.id ?? '').trim();

        if (fileAssetId) {

          registered.push({

            fileAssetId,

            name: String(res?.name ?? c.name ?? 'deliverable.md').trim() || 'deliverable.md',

            artifactIndex: c.artifactIndex,

          });

        }

      } catch (e: unknown) {

        const msg = e instanceof Error ? e.message : String(e);

        this.logger.warn('fileAssets.registerFromContent failed', {

          taskId: ctx.taskId,

          name: c.name,

          msg,

        });

      }

    }



    return registered;
  }

  /** CEO 汇总计划书等 Markdown 交付物登记。 */
  async registerMarkdownDeliverable(params: {
    companyId: string;
    agentId: string;
    taskId: string;
    name: string;
    content: string;
    category?: string;
  }): Promise<RegisteredFileAsset | null> {
    const content = String(params.content ?? '').trim();
    if (!content) return null;
    const actor = this.workerActor();
    const memoryNamespace = params.agentId ? `agent:${params.agentId}` : 'company';
    try {
      const res = await firstValueFrom(
        this.apiRpc
          .send<Record<string, unknown>>('fileAssets.registerFromContent', {
            companyId: params.companyId,
            actor,
            data: {
              content,
              name: String(params.name ?? 'deliverable.md').trim() || 'deliverable.md',
              contentType: 'text/markdown',
              sourceType: 'agent',
              sourceAgentId: params.agentId,
              sourceTaskId: params.taskId,
              category: params.category ?? 'report',
              ingest: false,
              memoryNamespace,
            },
          })
          .pipe(timeout(this.config.getApiRpcTimeoutMs())),
      );
      const fileAssetId = String(res?.id ?? '').trim();
      if (!fileAssetId) return null;
      return {
        fileAssetId,
        name: String(res?.name ?? params.name ?? 'deliverable.md').trim() || 'deliverable.md',
      };
    } catch (e: unknown) {
      this.logger.warn('fileAssets.registerMarkdownDeliverable failed', {
        taskId: params.taskId,
        name: params.name,
        msg: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }
}


