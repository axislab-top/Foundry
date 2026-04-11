import { BadRequestException, Injectable, Inject } from '@nestjs/common';
import type {
  IStorageAdapter,
  FileInfo,
  UploadOptions,
  ListOptions,
} from '../interfaces/storage.interface.js';
import {
  resolveTenantListPrefix,
  resolveTenantObjectKey,
} from './storage-tenant-path.util.js';

/**
 * 所有对象键必须经过租户解析：companies/{companyId}/...；读操作兼容 legacy memory/{companyId}/...
 */
@Injectable()
export class StorageService {
  private adapter: IStorageAdapter;

  constructor(@Inject('STORAGE_ADAPTER') adapter: IStorageAdapter) {
    this.adapter = adapter;
  }

  private assertCompanyId(companyId: string | undefined): string {
    if (!companyId?.trim()) {
      throw new BadRequestException('companyId is required');
    }
    return companyId.trim();
  }

  private generatedRelativePath(file: Express.Multer.File): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const extension = file.originalname.split('.').pop() || '';
    const nameWithoutExt = file.originalname.replace(/\.[^/.]+$/, '');
    const sanitizedName = nameWithoutExt
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 50);
    const fileName = `${sanitizedName}_${timestamp}_${random}.${extension}`;
    return `uploads/${fileName}`;
  }

  async upload(
    file: Express.Multer.File,
    companyId: string,
    path?: string,
    options?: UploadOptions,
  ): Promise<FileInfo> {
    const cid = this.assertCompanyId(companyId);
    const relative = path ?? this.generatedRelativePath(file);
    const key = resolveTenantObjectKey(cid, relative, 'write');
    return this.adapter.upload(file, key, options);
  }

  async download(companyId: string, path: string): Promise<Buffer> {
    const cid = this.assertCompanyId(companyId);
    const key = resolveTenantObjectKey(cid, path, 'read');
    return this.adapter.download(key);
  }

  async getUrl(
    companyId: string,
    path: string,
    expiresIn?: number,
  ): Promise<string> {
    const cid = this.assertCompanyId(companyId);
    const key = resolveTenantObjectKey(cid, path, 'read');
    return this.adapter.getUrl(key, expiresIn);
  }

  async delete(companyId: string, path: string): Promise<boolean> {
    const cid = this.assertCompanyId(companyId);
    const key = resolveTenantObjectKey(cid, path, 'read');
    return this.adapter.delete(key);
  }

  async exists(companyId: string, path: string): Promise<boolean> {
    const cid = this.assertCompanyId(companyId);
    const key = resolveTenantObjectKey(cid, path, 'read');
    return this.adapter.exists(key);
  }

  async getFileInfo(companyId: string, path: string): Promise<FileInfo> {
    const cid = this.assertCompanyId(companyId);
    const key = resolveTenantObjectKey(cid, path, 'read');
    return this.adapter.getFileInfo(key);
  }

  async list(
    companyId: string,
    prefix?: string,
    options?: ListOptions,
  ): Promise<FileInfo[]> {
    const cid = this.assertCompanyId(companyId);
    const p = resolveTenantListPrefix(cid, prefix);
    return this.adapter.list(p, options);
  }
}
