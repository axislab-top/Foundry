/**
 * 存储服务集成测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from '../../../apps/api/src/modules/files/storage/storage.service.js';

describe('Storage Integration', () => {
  let storageService: StorageService;

  describe('Local Storage Adapter', () => {
    it('should upload file to local storage', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'test.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 1024,
        buffer: Buffer.from('test content'),
      } as Express.Multer.File;

      const mockAdapter = {
        upload: jest.fn().mockResolvedValue({
          path: 'uploads/test.txt',
          size: 1024,
          mimetype: 'text/plain',
          url: 'http://localhost/uploads/test.txt',
        }),
      };

      const module = await Test.createTestingModule({
        providers: [
          StorageService,
          {
            provide: 'STORAGE_ADAPTER',
            useValue: mockAdapter,
          },
        ],
      }).compile();

      storageService = module.get<StorageService>(StorageService);

      const result = await storageService.upload(mockFile, 'uploads');

      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('url');
      expect(mockAdapter.upload).toHaveBeenCalled();
    });

    it('should download file from storage', async () => {
      const mockAdapter = {
        download: jest.fn().mockResolvedValue(Buffer.from('test content')),
      };

      const module = await Test.createTestingModule({
        providers: [
          StorageService,
          {
            provide: 'STORAGE_ADAPTER',
            useValue: mockAdapter,
          },
        ],
      }).compile();

      storageService = module.get<StorageService>(StorageService);

      const result = await storageService.download('uploads/test.txt');

      expect(result).toBeInstanceOf(Buffer);
      expect(mockAdapter.download).toHaveBeenCalledWith('uploads/test.txt');
    });

    it('should delete file from storage', async () => {
      const mockAdapter = {
        delete: jest.fn().mockResolvedValue(true),
      };

      const module = await Test.createTestingModule({
        providers: [
          StorageService,
          {
            provide: 'STORAGE_ADAPTER',
            useValue: mockAdapter,
          },
        ],
      }).compile();

      storageService = module.get<StorageService>(StorageService);

      const result = await storageService.delete('uploads/test.txt');

      expect(result).toBe(true);
      expect(mockAdapter.delete).toHaveBeenCalledWith('uploads/test.txt');
    });
  });
});








