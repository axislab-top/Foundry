/**
 * 存储服务测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service.js';
import { IStorageAdapter } from '../interfaces/storage.interface.js';

describe('StorageService', () => {
  let service: StorageService;
  let adapter: jest.Mocked<IStorageAdapter>;

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
    it('should upload file', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'test.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 1024,
        buffer: Buffer.from('test content'),
      } as Express.Multer.File;

      const mockFileInfo = {
        path: 'uploads/test.txt',
        size: 1024,
        mimetype: 'text/plain',
        url: 'http://localhost/uploads/test.txt',
      };

      adapter.upload.mockResolvedValue(mockFileInfo);

      const result = await service.upload(mockFile, 'uploads');

      expect(adapter.upload).toHaveBeenCalledWith(mockFile, 'uploads', undefined);
      expect(result).toEqual(mockFileInfo);
    });
  });

  describe('download', () => {
    it('should download file', async () => {
      const path = 'uploads/test.txt';
      const mockBuffer = Buffer.from('test content');

      adapter.download.mockResolvedValue(mockBuffer);

      const result = await service.download(path);

      expect(adapter.download).toHaveBeenCalledWith(path);
      expect(result).toEqual(mockBuffer);
    });
  });

  describe('getUrl', () => {
    it('should get file URL', async () => {
      const path = 'uploads/test.txt';
      const url = 'http://localhost/uploads/test.txt';

      adapter.getUrl.mockResolvedValue(url);

      const result = await service.getUrl(path);

      expect(adapter.getUrl).toHaveBeenCalledWith(path, undefined);
      expect(result).toBe(url);
    });

    it('should get file URL with expiration', async () => {
      const path = 'uploads/test.txt';
      const url = 'http://localhost/uploads/test.txt?expires=123456';
      const expiresIn = 3600;

      adapter.getUrl.mockResolvedValue(url);

      const result = await service.getUrl(path, expiresIn);

      expect(adapter.getUrl).toHaveBeenCalledWith(path, expiresIn);
      expect(result).toBe(url);
    });
  });

  describe('delete', () => {
    it('should delete file', async () => {
      const path = 'uploads/test.txt';

      adapter.delete.mockResolvedValue(true);

      const result = await service.delete(path);

      expect(adapter.delete).toHaveBeenCalledWith(path);
      expect(result).toBe(true);
    });
  });

  describe('exists', () => {
    it('should check if file exists', async () => {
      const path = 'uploads/test.txt';

      adapter.exists.mockResolvedValue(true);

      const result = await service.exists(path);

      expect(adapter.exists).toHaveBeenCalledWith(path);
      expect(result).toBe(true);
    });
  });

  describe('getFileInfo', () => {
    it('should get file info', async () => {
      const path = 'uploads/test.txt';
      const mockFileInfo = {
        path,
        size: 1024,
        mimetype: 'text/plain',
        url: 'http://localhost/uploads/test.txt',
      };

      adapter.getFileInfo.mockResolvedValue(mockFileInfo);

      const result = await service.getFileInfo(path);

      expect(adapter.getFileInfo).toHaveBeenCalledWith(path);
      expect(result).toEqual(mockFileInfo);
    });
  });

  describe('list', () => {
    it('should list files', async () => {
      const prefix = 'uploads/';
      const mockFiles = [
        {
          path: 'uploads/file1.txt',
          size: 1024,
          mimetype: 'text/plain',
          url: 'http://localhost/uploads/file1.txt',
        },
        {
          path: 'uploads/file2.txt',
          size: 2048,
          mimetype: 'text/plain',
          url: 'http://localhost/uploads/file2.txt',
        },
      ];

      adapter.list.mockResolvedValue(mockFiles);

      const result = await service.list(prefix);

      expect(adapter.list).toHaveBeenCalledWith(prefix, undefined);
      expect(result).toEqual(mockFiles);
    });
  });
});








