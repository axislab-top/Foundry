import { Module } from '@nestjs/common';
import { StorageModule } from './storage/storage.module.js';
import { FilesController } from './files.controller.js';
import { FilesRpcController } from './files.rpc.controller.js';

/**
 * 文件管理模块
 */
@Module({
  imports: [StorageModule.forRoot()],
  controllers: [FilesController, FilesRpcController],
  exports: [StorageModule],
})
export class FilesModule {}































