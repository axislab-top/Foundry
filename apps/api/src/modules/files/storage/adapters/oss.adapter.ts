import { Injectable } from '@nestjs/common';
import OSS from 'ali-oss';
import { BaseStorageAdapter } from './base.adapter.js';
import {
  IStorageAdapter,
  FileInfo,
  UploadOptions,
  ListOptions,
} from '../../interfaces/storage.interface.js';

/**
 * 阿里云 OSS 存储适配器
 */
@Injectable()
export class OSSStorageAdapter extends BaseStorageAdapter implements IStorageAdapter {
  private client: OSS;
  private readonly bucketName: string;

  constructor(
    accessKeyId: string,
    accessKeySecret: string,
    region: string,
    bucketName: string,
    endpoint?: string,
  ) {
    super();
    this.bucketName = bucketName;

    this.client = new OSS({
      accessKeyId,
      accessKeySecret,
      bucket: bucketName,
      region,
      endpoint,
    });
  }

  async upload(
    file: Express.Multer.File,
    path?: string,
    options?: UploadOptions,
  ): Promise<FileInfo> {
    const objectName = path || this.generatePath(file.originalname);
    const contentType = options?.contentType || file.mimetype;

    const result = await this.client.put(objectName, file.buffer, {
      mime: contentType,
      meta: options?.metadata,
      headers: {
        'x-oss-object-acl': options?.public ? 'public-read' : 'private',
      },
    });

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
    const result = await this.client.get(path);
    return result.content as Buffer;
  }

  async getUrl(path: string, expiresIn: number = 3600): Promise<string> {
    try {
      // 生成签名 URL
      const url = this.client.signatureUrl(path, {
        expires: expiresIn,
      });
      return url;
    } catch (error) {
      // 如果生成签名 URL 失败，返回公共 URL
      return `https://${this.bucketName}.oss-${this.client.options.region}.aliyuncs.com/${path}`;
    }
  }

  async delete(path: string): Promise<boolean> {
    try {
      await this.client.delete(path);
      return true;
    } catch (error) {
      return false;
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.client.head(path);
      return true;
    } catch (error) {
      return false;
    }
  }

  async getFileInfo(path: string): Promise<FileInfo> {
    const result = await this.client.head(path);
    const fileName = path.split('/').pop() || path;

    return {
      path,
      name: fileName,
      size: parseInt(result.res.headers['content-length'] || '0', 10),
      contentType: result.res.headers['content-type'] || 'application/octet-stream',
      url: await this.getUrl(path),
      createdAt: new Date(result.res.headers['last-modified'] || Date.now()),
      updatedAt: new Date(result.res.headers['last-modified'] || Date.now()),
      metadata: result.meta,
    };
  }

  async list(prefix?: string, options?: ListOptions): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    let marker: string | undefined = options?.marker;

    do {
      const result = await this.client.list({
        prefix,
        'max-keys': options?.maxKeys || 1000,
        marker,
      });

      if (result.objects) {
        for (const obj of result.objects) {
          try {
            const fileInfo = await this.getFileInfo(obj.name);
            files.push(fileInfo);

            if (options?.maxKeys && files.length >= options.maxKeys) {
              return files;
            }
          } catch (error) {
            // 忽略无法获取信息的文件
          }
        }
      }

      marker = result.nextMarker;
    } while (marker && (!options?.maxKeys || files.length < options.maxKeys));

    return files;
  }
}































