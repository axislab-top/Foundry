import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { BaseStorageAdapter } from './base.adapter.js';
import {
  IStorageAdapter,
  FileInfo,
  UploadOptions,
  ListOptions,
} from '../../interfaces/storage.interface.js';

/**
 * 本地存储适配器
 * 将文件存储在本地文件系统中
 */
@Injectable()
export class LocalStorageAdapter extends BaseStorageAdapter implements IStorageAdapter {
  private readonly basePath: string;
  private readonly baseUrl: string;

  constructor(basePath: string = './storage', baseUrl: string = '/api/files') {
    super();
    this.basePath = basePath;
    this.baseUrl = baseUrl;
  }

  /**
   * 确保目录存在
   */
  private async ensureDirectory(path: string): Promise<void> {
    try {
      await fs.access(path);
    } catch {
      await fs.mkdir(path, { recursive: true });
    }
  }

  /**
   * 获取完整文件路径
   */
  private getFullPath(path: string): string {
    return join(this.basePath, path);
  }

  async upload(
    file: Express.Multer.File,
    path?: string,
    options?: UploadOptions,
  ): Promise<FileInfo> {
    const filePath = path || this.generatePath(file.originalname);
    const fullPath = this.getFullPath(filePath);
    const dir = dirname(fullPath);

    // 确保目录存在
    await this.ensureDirectory(dir);

    // 写入文件
    await fs.writeFile(fullPath, file.buffer);

    const fileInfo: FileInfo = {
      path: filePath,
      name: file.originalname,
      size: file.size,
      contentType: options?.contentType || file.mimetype,
      url: `${this.baseUrl}/${filePath}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: options?.metadata,
    };

    return fileInfo;
  }

  async download(path: string): Promise<Buffer> {
    const fullPath = this.getFullPath(path);
    return await fs.readFile(fullPath);
  }

  async getUrl(path: string, expiresIn?: number): Promise<string> {
    // 本地存储不需要过期时间，直接返回 URL
    return `${this.baseUrl}/${path}`;
  }

  async delete(path: string): Promise<boolean> {
    try {
      const fullPath = this.getFullPath(path);
      await fs.unlink(fullPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      const fullPath = this.getFullPath(path);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async getFileInfo(path: string): Promise<FileInfo> {
    const fullPath = this.getFullPath(path);
    const stats = await fs.stat(fullPath);
    const fileName = path.split('/').pop() || path;

    return {
      path,
      name: fileName,
      size: stats.size,
      contentType: 'application/octet-stream', // 本地存储无法直接获取 MIME 类型
      url: `${this.baseUrl}/${path}`,
      createdAt: stats.birthtime,
      updatedAt: stats.mtime,
    };
  }

  async list(prefix?: string, options?: ListOptions): Promise<FileInfo[]> {
    const searchPath = prefix ? this.getFullPath(prefix) : this.basePath;
    const files: FileInfo[] = [];

    try {
      const entries = await fs.readdir(searchPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        const fullPath = join(searchPath, entry.name);

        if (entry.isFile()) {
          const fileInfo = await this.getFileInfo(entryPath);
          files.push(fileInfo);
        } else if (entry.isDirectory() && options?.recursive) {
          const subFiles = await this.list(entryPath, options);
          files.push(...subFiles);
        }

        if (options?.maxKeys && files.length >= options.maxKeys) {
          break;
        }
      }
    } catch (error) {
      // 目录不存在或无法访问
    }

    return files;
  }
}































