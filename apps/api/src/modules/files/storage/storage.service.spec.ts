/**
 * 存储服务测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StorageService } from './storage.service.js';
import { IStorageAdapter } from '../interfaces/storage.interface.js';

describe('StorageService', () => {
  let service: StorageService;
  let adapter: jest.Mocked<IStorageAdapter>;
  const companyId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  beforeEach(async () => {
    adapter = {
      upload: jest.fn(),
      download: jest.fn(),
      getUrl: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
      getFileInfo: jest.fn(),
      list: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: 'STORAGE_ADAPTER',
          useValue: adapter,
        },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upload', () => {
    it('should upload file with tenant prefix', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'test.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 1024,
        buffer: Buffer.from('test content'),
      } as Express.Multer.File;

      const mockFileInfo = {
        path: `companies/${companyId}/uploads/x`,
        size: 1024,
        contentType: 'text/plain',
        url: 'http://localhost/x',
      };

      adapter.upload.mockResolvedValue(mockFileInfo);

      const result = await service.upload(mockFile, companyId, 'uploads/x');

      expect(adapter.upload).toHaveBeenCalledWith(
        mockFile,
        `companies/${companyId}/uploads/x`,
        undefined,
      );
      expect(result).toEqual(mockFileInfo);
    });

    it('throws without companyId', async () => {
      const mockFile = {
        originalname: 'a.txt',
        mimetype: 'text/plain',
        size: 1,
        buffer: Buffer.from('x'),
      } as Express.Multer.File;
      await expect(service.upload(mockFile, '')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws on write path using legacy memory/{companyId}/ root (must use companies/.../memory/)', async () => {
      const mockFile = {
        originalname: 'a.txt',
        mimetype: 'text/plain',
        size: 1,
        buffer: Buffer.from('x'),
      } as Express.Multer.File;
      await expect(
        service.upload(mockFile, companyId, `memory/${companyId}/x.txt`),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(adapter.upload).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('throws without companyId', async () => {
      await expect(service.delete('', 'uploads/x')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(adapter.delete).not.toHaveBeenCalled();
    });
  });

  describe('download', () => {
    it('should resolve tenant key', async () => {
      const mockBuffer = Buffer.from('test');
      adapter.download.mockResolvedValue(mockBuffer);
      const result = await service.download(companyId, 'uploads/test.txt');
      expect(adapter.download).toHaveBeenCalledWith(
        `companies/${companyId}/uploads/test.txt`,
      );
      expect(result).toEqual(mockBuffer);
    });
  });

  describe('list', () => {
    it('should list under tenant prefix when prefix omitted', async () => {
      adapter.list.mockResolvedValue([]);
      await service.list(companyId);
      expect(adapter.list).toHaveBeenCalledWith(
        `companies/${companyId}/`,
        undefined,
      );
    });
  });
});
