import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '@service/tenant';
import { Agent } from '../agents/entities/agent.entity.js';
import { FilesModule } from '../files/files.module.js';
import { MemoryModule } from '../memory/memory.module.js';
import { Project } from '../projects/entities/project.entity.js';
import { FileAsset } from './entities/file-asset.entity.js';
import { FileAssetsController } from './file-assets.controller.js';
import { FileAssetsRpcController } from './file-assets.rpc.controller.js';
import { FileAssetsService } from './services/file-assets.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([FileAsset, Agent, Project]),
    TenantModule,
    FilesModule,
    MemoryModule,
  ],
  controllers: [FileAssetsRpcController, FileAssetsController],
  providers: [FileAssetsService],
  exports: [FileAssetsService],
})
export class FileAssetsModule {}
