/**
 * 加密服务测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService } from './encryption.service.js';
import { SecurityService } from './security.service.js';
import { createMockSecurityService } from '../../../../test/utils/mock-factories.js';

describe('EncryptionService', () => {
  let service: EncryptionService;
  let securityService: jest.Mocked<SecurityService>;
  let mockEncryptionManager: {
    encrypt: jest.Mock;
    decrypt: jest.Mock;
  };

  beforeEach(async () => {
    const mockSecurityService = createMockSecurityService();
    mockEncryptionManager = {
      encrypt: jest.fn((data: string) =>
        Promise.resolve({
          encrypted: Buffer.from(data).toString('base64'),
          iv: 'test-iv',
          tag: 'test-tag',
        }),
      ),
      decrypt: jest.fn((encrypted: string) => {
        const data = Buffer.from(encrypted, 'base64').toString('utf-8');
        return Promise.resolve(data);
      }),
    };
    mockSecurityService.getEncryptionManager = jest.fn(() => ({
      encrypt: mockEncryptionManager.encrypt,
      decrypt: mockEncryptionManager.decrypt,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: SecurityService,
          useValue: mockSecurityService,
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
    securityService = module.get(SecurityService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isEncryptionAvailable', () => {
    it('should return true when encryption manager is available', () => {
      expect(service.isEncryptionAvailable()).toBe(true);
    });

    it('should return false when encryption manager is not available', () => {
      const mockServiceWithoutEncryption = createMockSecurityService();
      mockServiceWithoutEncryption.getEncryptionManager = jest.fn(() => {
        throw new Error('EncryptionManager not initialized');
      });

      const module = Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: SecurityService,
            useValue: mockServiceWithoutEncryption,
          },
        ],
      }).compile();

      return module.then((m) => {
        const serviceWithoutEncryption = m.get<EncryptionService>(EncryptionService);
        expect(serviceWithoutEncryption.isEncryptionAvailable()).toBe(false);
      });
    });
  });

  describe('encryptToBase64', () => {
    it('should encrypt data to base64 string', async () => {
      const data = 'sensitive data';

      const result = await service.encryptToBase64(data);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(mockEncryptionManager.encrypt).toHaveBeenCalled();
    });

    it('should throw error when encryption manager is not available', async () => {
      const mockServiceWithoutEncryption = createMockSecurityService();
      mockServiceWithoutEncryption.getEncryptionManager = jest.fn(() => {
        throw new Error('EncryptionManager not initialized');
      });

      const module = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: SecurityService,
            useValue: mockServiceWithoutEncryption,
          },
        ],
      }).compile();

      const serviceWithoutEncryption = module.get<EncryptionService>(EncryptionService);

      await expect(
        serviceWithoutEncryption.encryptToBase64('data'),
      ).rejects.toThrow('EncryptionManager not initialized');
    });
  });

  describe('decryptFromBase64', () => {
    it('should decrypt data from base64 string', async () => {
      const encryptedData = Buffer.from(JSON.stringify({
        encrypted: Buffer.from('test data').toString('base64'),
        iv: 'test-iv',
        tag: 'test-tag',
      })).toString('base64');

      const result = await service.decryptFromBase64(encryptedData);

      expect(result).toBeDefined();
      expect(mockEncryptionManager.decrypt).toHaveBeenCalled();
    });
  });
});








