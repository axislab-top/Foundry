/**
 * 安全管理器（统一入口）
 */

import { TokenManager, type TokenManagerConfig } from './token-manager.js';
import { HashingManager, type HashingManagerConfig } from './hashing-manager.js';
import { EncryptionManager, type EncryptionManagerConfig } from './encryption-manager.js';
import { AuthorizationManager, type AuthorizationManagerConfig } from './authorization-manager.js';
import type { SecurityConfig } from '../config/security-config.js';
import { TokenAdapterType } from '../types/token.types.js';
import { HashingAdapterType } from '../types/hashing.types.js';
import { EncryptionAdapterType } from '../types/encryption.types.js';

export interface SecurityManagerConfig {
  token?: TokenManagerConfig;
  hashing?: HashingManagerConfig;
  encryption?: EncryptionManagerConfig;
  authorization?: AuthorizationManagerConfig;
}

export class SecurityManager {
  private static instance: SecurityManager | null = null;
  private tokenManager?: TokenManager;
  private hashingManager?: HashingManager;
  private encryptionManager?: EncryptionManager;
  private authorizationManager?: AuthorizationManager;

  private constructor(config?: SecurityManagerConfig) {
    if (config?.token) {
      this.tokenManager = TokenManager.create(config.token);
    }
    if (config?.hashing) {
      this.hashingManager = HashingManager.create(config.hashing);
    }
    if (config?.encryption) {
      this.encryptionManager = EncryptionManager.create(config.encryption);
    }
    if (config?.authorization) {
      this.authorizationManager = AuthorizationManager.create(config.authorization);
    }
  }

  static create(config?: SecurityManagerConfig): SecurityManager {
    if (!SecurityManager.instance) {
      SecurityManager.instance = new SecurityManager(config);
    }
    return SecurityManager.instance;
  }

  static getInstance(): SecurityManager {
    if (!SecurityManager.instance) {
      throw new Error('SecurityManager not initialized. Call create() first.');
    }
    return SecurityManager.instance;
  }

  static reset(): void {
    SecurityManager.instance = null;
    TokenManager.reset();
    HashingManager.reset();
    EncryptionManager.reset();
    AuthorizationManager.reset();
  }

  /**
   * 从配置创建安全管理器
   */
  static createFromConfig(config: SecurityConfig): SecurityManager {
    const managerConfig: SecurityManagerConfig = {};

    if (config.jwt) {
      // 只包含有值的选项，避免传递 undefined
      const jwtOptions: any = {
        secret: config.jwt.secret,
        algorithm: config.jwt.algorithm,
        expiresIn: config.jwt.expiresIn,
      };
      
      if (config.jwt.issuer) {
        jwtOptions.issuer = config.jwt.issuer;
      }
      
      if (config.jwt.audience) {
        jwtOptions.audience = config.jwt.audience;
      }

      managerConfig.token = {
        defaultAdapter: TokenAdapterType.JWT,
        adapters: [
          {
            adapter: TokenAdapterType.JWT,
            options: jwtOptions,
          },
        ],
      };
    }

    if (config.hashing) {
      managerConfig.hashing = {
        defaultAdapter: config.hashing.defaultAdapter as HashingAdapterType,
        adapters: [
          config.hashing.defaultAdapter === HashingAdapterType.BCRYPT
            ? {
                adapter: HashingAdapterType.BCRYPT,
                options: config.hashing.bcrypt || {},
              }
            : {
                adapter: HashingAdapterType.ARGON2,
                options: config.hashing.argon2 || {},
              },
        ],
      };
    }

    if (config.encryption) {
      managerConfig.encryption = {
        defaultAdapter: config.encryption.defaultAdapter as EncryptionAdapterType,
        adapters: [
          config.encryption.defaultAdapter === EncryptionAdapterType.AES
            ? {
                adapter: EncryptionAdapterType.AES,
                options: config.encryption.aes || { key: '' },
              }
            : {
                adapter: EncryptionAdapterType.RSA,
                options: config.encryption.rsa || { publicKey: '', privateKey: '' },
              },
        ],
      };
    }

    // 如果配置中包含 authorization 且启用，则初始化 AuthorizationManager
    if (config.authorization && config.authorization.enabled !== false) {
      managerConfig.authorization = {
        policies: config.authorization.policies || [],
      };
    }

    return SecurityManager.create(managerConfig);
  }

  getTokenManager(): TokenManager {
    if (!this.tokenManager) {
      throw new Error('TokenManager not initialized');
    }
    return this.tokenManager;
  }

  getHashingManager(): HashingManager {
    if (!this.hashingManager) {
      throw new Error('HashingManager not initialized');
    }
    return this.hashingManager;
  }

  getEncryptionManager(): EncryptionManager {
    if (!this.encryptionManager) {
      throw new Error('EncryptionManager not initialized');
    }
    return this.encryptionManager;
  }

  getAuthorizationManager(): AuthorizationManager {
    if (!this.authorizationManager) {
      throw new Error('AuthorizationManager not initialized');
    }
    return this.authorizationManager;
  }
}










