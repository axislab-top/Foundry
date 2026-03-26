import { Module, DynamicModule, Provider } from '@nestjs/common';
import { ConfigModule } from '../../../common/config/config.module.js';
import { ConfigService } from '../../../common/config/config.service.js';
import { StorageService } from './storage.service.js';
import { IStorageAdapter, StorageType } from '../interfaces/storage.interface.js';
import { LocalStorageAdapter } from './adapters/local.adapter.js';
import { MinIOStorageAdapter } from './adapters/minio.adapter.js';
import { S3StorageAdapter } from './adapters/s3.adapter.js';
import { OSSStorageAdapter } from './adapters/oss.adapter.js';

/**
 * 存储模块
 * 根据配置动态选择存储适配器
 */
@Module({})
export class StorageModule {
  static forRoot(): DynamicModule {
    return {
      module: StorageModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: 'STORAGE_ADAPTER',
          useFactory: (configService: ConfigService): IStorageAdapter => {
            const storageConfig = configService.getStorageConfig();
            const type = storageConfig.type;

            switch (type) {
              case 'minio':
                return new MinIOStorageAdapter(
                  storageConfig.minio.endpoint,
                  storageConfig.minio.port,
                  storageConfig.minio.useSSL,
                  storageConfig.minio.accessKey,
                  storageConfig.minio.secretKey,
                  storageConfig.minio.bucketName,
                  storageConfig.minio.baseUrl,
                );

              case 's3':
                return new S3StorageAdapter(
                  storageConfig.s3.accessKeyId,
                  storageConfig.s3.secretAccessKey,
                  storageConfig.s3.region,
                  storageConfig.s3.bucketName,
                  storageConfig.s3.endpoint,
                );

              case 'oss':
                return new OSSStorageAdapter(
                  storageConfig.oss.accessKeyId,
                  storageConfig.oss.accessKeySecret,
                  storageConfig.oss.region,
                  storageConfig.oss.bucketName,
                  storageConfig.oss.endpoint,
                );

              case 'local':
              default:
                return new LocalStorageAdapter(
                  storageConfig.local.basePath,
                  storageConfig.local.baseUrl,
                );
            }
          },
          inject: [ConfigService],
        },
        StorageService,
      ],
      exports: [StorageService],
    };
  }
}































