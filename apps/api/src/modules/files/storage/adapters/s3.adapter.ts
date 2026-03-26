import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BaseStorageAdapter } from './base.adapter.js';
import {
  IStorageAdapter,
  FileInfo,
  UploadOptions,
  ListOptions,
} from '../../interfaces/storage.interface.js';

/**
 * AWS S3 存储适配器
 */
@Injectable()
export class S3StorageAdapter extends BaseStorageAdapter implements IStorageAdapter {
  private client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;

  constructor(
    accessKeyId: string,
    secretAccessKey: string,
    region: string,
    bucketName: string,
    endpoint?: string,
  ) {
    super();
    this.bucketName = bucketName;
    this.region = region;

    this.client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      ...(endpoint && { endpoint }),
    });
  }

  async upload(
    file: Express.Multer.File,
    path?: string,
    options?: UploadOptions,
  ): Promise<FileInfo> {
    const key = path || this.generatePath(file.originalname);
    const contentType = options?.contentType || file.mimetype;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: contentType,
      Metadata: options?.metadata,
      ACL: options?.public ? 'public-read' : 'private',
    });

    await this.client.send(command);

    const url = await this.getUrl(key);

    return {
      path: key,
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
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: path,
    });

    const response = await this.client.send(command);
    const chunks: Uint8Array[] = [];

    if (response.Body) {
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
    }

    return Buffer.concat(chunks);
  }

  async getUrl(path: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: path,
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }

  async delete(path: string): Promise<boolean> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: path,
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      return false;
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: path,
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      return false;
    }
  }

  async getFileInfo(path: string): Promise<FileInfo> {
    const command = new HeadObjectCommand({
      Bucket: this.bucketName,
      Key: path,
    });

    const response = await this.client.send(command);
    const fileName = path.split('/').pop() || path;

    return {
      path,
      name: fileName,
      size: response.ContentLength || 0,
      contentType: response.ContentType || 'application/octet-stream',
      url: await this.getUrl(path),
      createdAt: response.LastModified || new Date(),
      updatedAt: response.LastModified || new Date(),
      metadata: response.Metadata,
    };
  }

  async list(prefix?: string, options?: ListOptions): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    let continuationToken: string | undefined = options?.marker;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: options?.maxKeys || 1000,
        ContinuationToken: continuationToken,
      });

      const response = await this.client.send(command);

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) {
            try {
              const fileInfo = await this.getFileInfo(obj.Key);
              files.push(fileInfo);

              if (options?.maxKeys && files.length >= options.maxKeys) {
                return files;
              }
            } catch (error) {
              // 忽略无法获取信息的文件
            }
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken && (!options?.maxKeys || files.length < options.maxKeys));

    return files;
  }
}































