import { Injectable, Inject, Optional } from '@nestjs/common';
import type {
  IStorageAdapter,
  StorageType,
  FileInfo,
  UploadOptions,
  ListOptions,
} from '../interfaces/storage.interface.js';
import { ConfigService } from '../../../common/config/config.service.js';

/**
 * 存储服务
 * 统一管理存储适配器，提供统一的存储接口
 */
@Injectable()
export class StorageService {
  private adapter: IStorageAdapter;

  constructor(
    @Inject('STORAGE_ADAPTER') adapter: IStorageAdapter,
    @Optional() private readonly configService?: ConfigService,
  ) {
    this.adapter = adapter;
  }

  /**
   * 上传文件
   */
  async upload(
    file: Express.Multer.File,
    path?: string,
    options?: UploadOptions,
  ): Promise<FileInfo> {
    return this.adapter.upload(file, path, options);
  }

  /**
   * 下载文件
   */
  async download(path: string): Promise<Buffer> {
    return this.adapter.download(path);
  }

  /**
   * 获取文件 URL
   */
  async getUrl(path: string, expiresIn?: number): Promise<string> {
    return this.adapter.getUrl(path, expiresIn);
  }

  /**
   * 删除文件
   */
  async delete(path: string): Promise<boolean> {
    return this.adapter.delete(path);
  }

  /**
   * 检查文件是否存在
   */
  async exists(path: string): Promise<boolean> {
    return this.adapter.exists(path);
  }

  /**
   * 获取文件信息
   */
  async getFileInfo(path: string): Promise<FileInfo> {
    return this.adapter.getFileInfo(path);
  }

  /**
   * 列出文件
   */
  async list(prefix?: string, options?: ListOptions): Promise<FileInfo[]> {
    return this.adapter.list(prefix, options);
  }
}































