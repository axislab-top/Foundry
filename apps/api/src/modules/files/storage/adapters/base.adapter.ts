import { IStorageAdapter, FileInfo, UploadOptions, ListOptions } from '../../interfaces/storage.interface.js';

/**
 * 基础适配器
 * 提供通用的工具方法
 */
export abstract class BaseStorageAdapter implements IStorageAdapter {
  /**
   * 生成文件路径
   * @param originalName 原始文件名
   * @param prefix 路径前缀（可选）
   * @returns 生成的文件路径
   */
  protected generatePath(originalName: string, prefix?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const extension = originalName.split('.').pop() || '';
    const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
    const sanitizedName = nameWithoutExt
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 50);
    
    const fileName = `${sanitizedName}_${timestamp}_${random}.${extension}`;
    
    if (prefix) {
      return `${prefix.replace(/\/$/, '')}/${fileName}`;
    }
    
    return fileName;
  }

  /**
   * 验证文件大小
   * @param size 文件大小（字节）
   * @param maxSize 最大大小（字节）
   */
  protected validateFileSize(size: number, maxSize: number): void {
    if (size > maxSize) {
      throw new Error(`File size exceeds maximum allowed size: ${maxSize} bytes`);
    }
  }

  /**
   * 验证文件类型
   * @param mimeType MIME 类型
   * @param allowedTypes 允许的类型列表
   */
  protected validateFileType(mimeType: string, allowedTypes: string[]): void {
    if (!allowedTypes.includes(mimeType)) {
      throw new Error(`File type ${mimeType} is not allowed. Allowed types: ${allowedTypes.join(', ')}`);
    }
  }

  /**
   * 抽象方法：子类必须实现
   */
  abstract upload(
    file: Express.Multer.File,
    path?: string,
    options?: UploadOptions,
  ): Promise<FileInfo>;

  abstract download(path: string): Promise<Buffer>;

  abstract getUrl(path: string, expiresIn?: number, downloadFileName?: string): Promise<string>;

  abstract delete(path: string): Promise<boolean>;

  abstract exists(path: string): Promise<boolean>;

  abstract getFileInfo(path: string): Promise<FileInfo>;

  abstract list(prefix?: string, options?: ListOptions): Promise<FileInfo[]>;
}































