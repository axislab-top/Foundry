import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as MinIO from 'minio';
import { BaseStorageAdapter } from './base.adapter.js';
import {
  IStorageAdapter,
  FileInfo,
  UploadOptions,
  ListOptions,
} from '../../interfaces/storage.interface.js';
import { buildAttachmentContentDisposition } from '../content-disposition.util.js';

/**
 * MinIO 存储适配器
 * S3 兼容的对象存储
 */
@Injectable()
export class MinIOStorageAdapter
  extends BaseStorageAdapter
  implements IStorageAdapter, OnModuleInit, OnModuleDestroy
{
  private client: MinIO.Client;
  private readonly bucketName: string;
  private readonly baseUrl: string;

  constructor(
    endpoint: string,
    port: number,
    useSSL: boolean,
    accessKey: string,
    secretKey: string,
    bucketName: string,
    baseUrl?: string,
  ) {
    super();
    this.bucketName = bucketName;
    this.baseUrl = baseUrl || `http://${endpoint}:${port}`;

    this.client = new MinIO.Client({
      endPoint: endpoint,
      port: port,
      useSSL: useSSL,
      accessKey: accessKey,
      secretKey: secretKey,
    });
  }

  async onModuleInit() {
    // 确保存储桶存在
    const exists = await this.client.bucketExists(this.bucketName);
    if (!exists) {
      await this.client.makeBucket(this.bucketName, 'us-east-1');
    }
  }

  async onModuleDestroy() {
    // MinIO 客户端不需要显式关闭
  }

  private assertTenantObjectKey(key: string): void {
    if (
      key.startsWith('companies/') ||
      key.startsWith('memory/') ||
      key.startsWith('skills/') ||
      key.startsWith('platform/')
    ) {
      return;
    }
    throw new Error(
      'MinIO object key must be tenant-scoped (companies/..., memory/..., skills/..., or platform/...)',
    );
  }

  async upload(
    file: Express.Multer.File,
    path?: string,
    options?: UploadOptions,
  ): Promise<FileInfo> {
    const objectName = path || this.generatePath(file.originalname);
    this.assertTenantObjectKey(objectName);
    const contentType = options?.contentType || file.mimetype;

    await this.client.putObject(
      this.bucketName,
      objectName,
      file.buffer,
      file.size,
      {
        'Content-Type': contentType,
        ...options?.metadata,
      },
    );

    const url = await this.getUrl(objectName);

    return {
      path: objectName,
      name: file.originalname,
      size: file.size,
      contentType,
      url,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: options?.metadata,
    };
  }

  async download(path: string): Promise<Buffer> {
    this.assertTenantObjectKey(path);
    const dataStream = await this.client.getObject(this.bucketName, path);
    const chunks: Buffer[] = [];
    return await new Promise((resolve, reject) => {
      dataStream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      dataStream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      dataStream.on('error', (error: Error) => {
        reject(error);
      });
    });
  }

  async getUrl(
    path: string,
    expiresIn: number = 7 * 24 * 60 * 60,
    downloadFileName?: string,
  ): Promise<string> {
    this.assertTenantObjectKey(path);
    try {
      const respHeaders = downloadFileName
        ? { 'response-content-disposition': buildAttachmentContentDisposition(downloadFileName) }
        : undefined;
      const url = await this.client.presignedGetObject(
        this.bucketName,
        path,
        expiresIn,
        respHeaders,
      );
      return url;
    } catch (error) {
      // 如果生成预签名 URL 失败，返回公共 URL
      return `${this.baseUrl}/${this.bucketName}/${path}`;
    }
  }

  async delete(path: string): Promise<boolean> {
    this.assertTenantObjectKey(path);
    try {
      await this.client.removeObject(this.bucketName, path);
      return true;
    } catch (error) {
      return false;
    }
  }

  async exists(path: string): Promise<boolean> {
    this.assertTenantObjectKey(path);
    try {
      await this.client.statObject(this.bucketName, path);
      return true;
    } catch (error) {
      return false;
    }
  }

  async getFileInfo(path: string): Promise<FileInfo> {
    this.assertTenantObjectKey(path);
    const stat = await this.client.statObject(this.bucketName, path);
    const fileName = path.split('/').pop() || path;

    return {
      path,
      name: fileName,
      size: stat.size,
      contentType: stat.metaData['content-type'] || 'application/octet-stream',
      url: await this.getUrl(path),
      createdAt: stat.lastModified,
      updatedAt: stat.lastModified,
      metadata: stat.metaData,
    };
  }

  async list(prefix?: string, options?: ListOptions): Promise<FileInfo[]> {
    if (prefix != null && prefix !== '') {
      this.assertTenantObjectKey(prefix);
    }
    const files: FileInfo[] = [];
    const stream = this.client.listObjects(
      this.bucketName,
      prefix,
      options?.recursive,
    );

    return new Promise((resolve, reject) => {
      stream.on('data', async (obj) => {
        if (obj.name) {
          try {
            const fileInfo = await this.getFileInfo(obj.name);
            files.push(fileInfo);

            if (options?.maxKeys && files.length >= options.maxKeys) {
              stream.destroy();
              resolve(files);
            }
          } catch (error) {
            // 忽略无法获取信息的文件
          }
        }
      });

      stream.on('end', () => {
        resolve(files);
      });

      stream.on('error', (error) => {
        reject(error);
      });
    });
  }
}































