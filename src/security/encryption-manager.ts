/**
 * Encryption Manager
 * 데이터 암호화 및 복호화 관리 시스템
 */

import crypto from 'crypto';
import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import {
  SecurityConfig,
  EncryptionResult,
  DecryptionInput,
  SecurityEvent
} from './types.js';

export interface EncryptionOptions {
  algorithm?: string;
  keyLength?: number;
  ivLength?: number;
  tagLength?: number;
  encoding?: BufferEncoding;
}

export interface KeyRotationConfig {
  enabled: boolean;
  intervalDays: number;
  keepOldKeys: number;
}

export interface EncryptionKey {
  id: string;
  key: Buffer;
  algorithm: string;
  createdAt: Date;
  isActive: boolean;
  version: number;
}

export class EncryptionManager extends EventEmitter {
  private config: SecurityConfig;
  private keys = new Map<string, EncryptionKey>();
  private activeKeyId: string | null = null;
  private keyRotationTimer?: NodeJS.Timeout;

  private readonly DEFAULT_ALGORITHM = 'aes-256-gcm';
  private readonly DEFAULT_KEY_LENGTH = 32;
  private readonly DEFAULT_IV_LENGTH = 16;
  private readonly DEFAULT_TAG_LENGTH = 16;

  constructor(config: SecurityConfig, keyRotationConfig?: KeyRotationConfig) {
    super();
    this.config = config;
    this.initializeEncryption();
    
    if (keyRotationConfig?.enabled) {
      this.startKeyRotation(keyRotationConfig);
    }
  }

  /**
   * 암호화 시스템 초기화
   */
  private initializeEncryption(): void {
    // 기본 암호화 키 생성
    const masterKey = this.generateEncryptionKey();
    this.activeKeyId = masterKey.id;
    
    this.logSecurityEvent({
      type: 'encryption_initialized',
      resource: 'encryption',
      action: 'create',
      success: true,
      message: 'Encryption system initialized with master key'
    });
  }

  /**
   * 새로운 암호화 키 생성
   */
  private generateEncryptionKey(version?: number): EncryptionKey {
    const keyId = uuidv4();
    const algorithm = this.config.encryption?.algorithm || this.DEFAULT_ALGORITHM;
    const keyLength = this.config.encryption?.keyLength || this.DEFAULT_KEY_LENGTH;
    
    const key: EncryptionKey = {
      id: keyId,
      key: crypto.randomBytes(keyLength),
      algorithm,
      createdAt: new Date(),
      isActive: true,
      version: version || 1
    };

    this.keys.set(keyId, key);
    return key;
  }

  /**
   * 데이터 암호화
   */
  async encrypt(
    data: string | Buffer,
    options?: EncryptionOptions
  ): Promise<EncryptionResult> {
    try {
      const activeKey = this.getActiveKey();
      if (!activeKey) {
        throw new Error('No active encryption key available');
      }

      const algorithm = options?.algorithm || activeKey.algorithm;
      const ivLength = options?.ivLength || this.DEFAULT_IV_LENGTH;
      const encoding = options?.encoding || 'base64';

      // IV(Initialization Vector) 생성
      const iv = crypto.randomBytes(ivLength);
      
      // 암호화 수행
      const cipher = crypto.createCipher(algorithm, activeKey.key);
      cipher.setAAD(Buffer.from(activeKey.id)); // Additional Authenticated Data
      
      const inputBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      const encrypted = Buffer.concat([
        cipher.update(inputBuffer),
        cipher.final()
      ]);

      // 인증 태그 추출 (GCM 모드에서만)
      let tag: string | undefined;
      if (algorithm.includes('gcm')) {
        tag = (cipher as crypto.CipherGCM).getAuthTag().toString(encoding);
      }

      const result: EncryptionResult = {
        encrypted: encrypted.toString(encoding),
        iv: iv.toString(encoding),
        tag
      };

      this.logSecurityEvent({
        type: 'data_encrypted',
        resource: 'encryption',
        action: 'create',
        success: true,
        message: `Data encrypted using key ${activeKey.id}`,
        metadata: { 
          keyId: activeKey.id,
          algorithm,
          dataSize: inputBuffer.length
        }
      });

      return result;

    } catch (error) {
      this.logSecurityEvent({
        type: 'encryption_failed',
        resource: 'encryption',
        action: 'create',
        success: false,
        message: `Encryption failed: ${(error as Error).message}`
      });

      throw new Error(`Encryption failed: ${(error as Error).message}`);
    }
  }

  /**
   * 데이터 복호화
   */
  async decrypt(
    input: DecryptionInput,
    keyId?: string,
    options?: EncryptionOptions
  ): Promise<string> {
    try {
      const key = keyId ? this.keys.get(keyId) : this.getActiveKey();
      if (!key) {
        throw new Error(`Encryption key not found: ${keyId || 'active key'}`);
      }

      const algorithm = options?.algorithm || key.algorithm;
      const encoding = options?.encoding || 'base64';

      // 복호화 수행
      const decipher = crypto.createDecipher(algorithm, key.key);
      decipher.setAAD(Buffer.from(key.id)); // Additional Authenticated Data
      
      // 인증 태그 설정 (GCM 모드에서만)
      if (algorithm.includes('gcm') && input.tag) {
        (decipher as crypto.DecipherGCM).setAuthTag(Buffer.from(input.tag, encoding));
      }

      const encryptedBuffer = Buffer.from(input.encrypted, encoding);
      const decrypted = Buffer.concat([
        decipher.update(encryptedBuffer),
        decipher.final()
      ]);

      const result = decrypted.toString('utf8');

      this.logSecurityEvent({
        type: 'data_decrypted',
        resource: 'encryption',
        action: 'read',
        success: true,
        message: `Data decrypted using key ${key.id}`,
        metadata: { 
          keyId: key.id,
          algorithm,
          dataSize: result.length
        }
      });

      return result;

    } catch (error) {
      this.logSecurityEvent({
        type: 'decryption_failed',
        resource: 'encryption',
        action: 'read',
        success: false,
        message: `Decryption failed: ${(error as Error).message}`
      });

      throw new Error(`Decryption failed: ${(error as Error).message}`);
    }
  }

  /**
   * 해시 생성 (비밀번호, 체크섬 등)
   */
  async createHash(
    data: string | Buffer,
    algorithm: string = 'sha256',
    salt?: string
  ): Promise<string> {
    try {
      const inputData = typeof data === 'string' ? data : data.toString('utf8');
      const saltedData = salt ? `${inputData}${salt}` : inputData;
      
      const hash = crypto.createHash(algorithm);
      hash.update(saltedData, 'utf8');
      const result = hash.digest('hex');

      this.logSecurityEvent({
        type: 'hash_created',
        resource: 'encryption',
        action: 'create',
        success: true,
        message: `Hash created using ${algorithm}`,
        metadata: { 
          algorithm,
          hasSalt: !!salt,
          inputSize: inputData.length
        }
      });

      return result;

    } catch (error) {
      this.logSecurityEvent({
        type: 'hash_failed',
        resource: 'encryption',
        action: 'create',
        success: false,
        message: `Hash creation failed: ${(error as Error).message}`
      });

      throw new Error(`Hash creation failed: ${(error as Error).message}`);
    }
  }

  /**
   * HMAC 생성 (메시지 인증 코드)
   */
  async createHMAC(
    data: string | Buffer,
    secret?: string,
    algorithm: string = 'sha256'
  ): Promise<string> {
    try {
      const activeKey = this.getActiveKey();
      const secretKey = secret || (activeKey ? activeKey.key.toString('hex') : '');
      
      if (!secretKey) {
        throw new Error('No secret key available for HMAC');
      }

      const inputData = typeof data === 'string' ? data : data.toString('utf8');
      const hmac = crypto.createHmac(algorithm, secretKey);
      hmac.update(inputData, 'utf8');
      const result = hmac.digest('hex');

      this.logSecurityEvent({
        type: 'hmac_created',
        resource: 'encryption',
        action: 'create',
        success: true,
        message: `HMAC created using ${algorithm}`,
        metadata: { 
          algorithm,
          inputSize: inputData.length
        }
      });

      return result;

    } catch (error) {
      this.logSecurityEvent({
        type: 'hmac_failed',
        resource: 'encryption',
        action: 'create',
        success: false,
        message: `HMAC creation failed: ${(error as Error).message}`
      });

      throw new Error(`HMAC creation failed: ${(error as Error).message}`);
    }
  }

  /**
   * 암호화된 토큰 생성 (세션 토큰, API 키 등)
   */
  async generateSecureToken(
    payload: Record<string, any>,
    expiresIn?: number
  ): Promise<string> {
    try {
      const tokenData = {
        ...payload,
        id: uuidv4(),
        createdAt: Date.now(),
        expiresAt: expiresIn ? Date.now() + expiresIn : undefined
      };

      const tokenString = JSON.stringify(tokenData);
      const encrypted = await this.encrypt(tokenString);
      
      // 토큰 형식: keyId.encrypted.iv.tag (base64 인코딩)
      const parts = [
        this.activeKeyId,
        encrypted.encrypted,
        encrypted.iv,
        encrypted.tag || ''
      ];

      const token = Buffer.from(parts.join('.')).toString('base64url');

      this.logSecurityEvent({
        type: 'secure_token_created',
        resource: 'encryption',
        action: 'create',
        success: true,
        message: 'Secure token generated',
        metadata: { 
          tokenId: tokenData.id,
          expiresIn,
          payloadKeys: Object.keys(payload)
        }
      });

      return token;

    } catch (error) {
      this.logSecurityEvent({
        type: 'token_creation_failed',
        resource: 'encryption',
        action: 'create',
        success: false,
        message: `Token creation failed: ${(error as Error).message}`
      });

      throw new Error(`Token creation failed: ${(error as Error).message}`);
    }
  }

  /**
   * 암호화된 토큰 검증 및 복호화
   */
  async verifySecureToken(token: string): Promise<Record<string, any> | null> {
    try {
      const tokenString = Buffer.from(token, 'base64url').toString('utf8');
      const parts = tokenString.split('.');
      
      if (parts.length !== 4) {
        throw new Error('Invalid token format');
      }

      const [keyId, encrypted, iv, tag] = parts;
      
      const decryptionInput: DecryptionInput = {
        encrypted,
        iv,
        tag: tag || undefined
      };

      const decryptedData = await this.decrypt(decryptionInput, keyId);
      const tokenData = JSON.parse(decryptedData);

      // 만료 시간 확인
      if (tokenData.expiresAt && Date.now() > tokenData.expiresAt) {
        this.logSecurityEvent({
          type: 'token_expired',
          resource: 'encryption',
          action: 'read',
          success: false,
          message: 'Token verification failed: expired',
          metadata: { tokenId: tokenData.id }
        });
        return null;
      }

      this.logSecurityEvent({
        type: 'token_verified',
        resource: 'encryption',
        action: 'read',
        success: true,
        message: 'Token verified successfully',
        metadata: { tokenId: tokenData.id }
      });

      return tokenData;

    } catch (error) {
      this.logSecurityEvent({
        type: 'token_verification_failed',
        resource: 'encryption',
        action: 'read',
        success: false,
        message: `Token verification failed: ${(error as Error).message}`
      });

      return null;
    }
  }

  /**
   * 키 순환 (Key Rotation)
   */
  async rotateKeys(): Promise<void> {
    try {
      const oldKey = this.getActiveKey();
      const newKey = this.generateEncryptionKey(oldKey ? oldKey.version + 1 : 1);
      
      // 이전 키 비활성화
      if (oldKey) {
        oldKey.isActive = false;
      }

      this.activeKeyId = newKey.id;

      this.logSecurityEvent({
        type: 'key_rotated',
        resource: 'encryption',
        action: 'update',
        success: true,
        message: 'Encryption keys rotated',
        metadata: { 
          oldKeyId: oldKey?.id,
          newKeyId: newKey.id,
          newVersion: newKey.version
        }
      });

      this.emit('keyRotated', { oldKey, newKey });

    } catch (error) {
      this.logSecurityEvent({
        type: 'key_rotation_failed',
        resource: 'encryption',
        action: 'update',
        success: false,
        message: `Key rotation failed: ${(error as Error).message}`
      });

      throw new Error(`Key rotation failed: ${(error as Error).message}`);
    }
  }

  /**
   * 오래된 키 정리
   */
  async cleanupOldKeys(keepCount: number = 5): Promise<void> {
    const allKeys = Array.from(this.keys.values());
    const sortedKeys = allKeys.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    const keysToDelete = sortedKeys.slice(keepCount);
    let deletedCount = 0;

    for (const key of keysToDelete) {
      if (!key.isActive) {
        this.keys.delete(key.id);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      this.logSecurityEvent({
        type: 'old_keys_cleaned',
        resource: 'encryption',
        action: 'delete',
        success: true,
        message: `Cleaned up ${deletedCount} old encryption keys`,
        metadata: { deletedCount, keepCount }
      });
    }
  }

  /**
   * 활성 키 조회
   */
  private getActiveKey(): EncryptionKey | null {
    if (!this.activeKeyId) {
      return null;
    }
    return this.keys.get(this.activeKeyId) || null;
  }

  /**
   * 키 순환 타이머 시작
   */
  private startKeyRotation(config: KeyRotationConfig): void {
    const intervalMs = config.intervalDays * 24 * 60 * 60 * 1000;
    
    this.keyRotationTimer = setInterval(async () => {
      try {
        await this.rotateKeys();
        await this.cleanupOldKeys(config.keepOldKeys);
      } catch (error) {
        this.logSecurityEvent({
          type: 'automatic_key_rotation_failed',
          resource: 'encryption',
          action: 'update',
          success: false,
          message: `Automatic key rotation failed: ${(error as Error).message}`
        });
      }
    }, intervalMs);

    this.logSecurityEvent({
      type: 'key_rotation_scheduled',
      resource: 'encryption',
      action: 'create',
      success: true,
      message: `Key rotation scheduled every ${config.intervalDays} days`
    });
  }

  /**
   * 암호화 통계 조회
   */
  getEncryptionStats(): Record<string, any> {
    const keys = Array.from(this.keys.values());
    const activeKey = this.getActiveKey();
    
    return {
      totalKeys: keys.length,
      activeKeyId: this.activeKeyId,
      activeKeyVersion: activeKey?.version || 0,
      keyAgeHours: activeKey ? 
        Math.floor((Date.now() - activeKey.createdAt.getTime()) / (1000 * 60 * 60)) : 0,
      algorithms: [...new Set(keys.map(key => key.algorithm))],
      oldestKeyDate: keys.length > 0 ? 
        Math.min(...keys.map(key => key.createdAt.getTime())) : null
    };
  }

  /**
   * 보안 이벤트 로깅
   */
  private logSecurityEvent(eventData: Omit<SecurityEvent, 'id' | 'timestamp' | 'ipAddress' | 'userAgent'>): void {
    const event: SecurityEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      ipAddress: 'localhost',
      userAgent: 'encryption-manager',
      ...eventData
    };

    this.emit('securityEvent', event);
  }

  /**
   * 정리 작업
   */
  cleanup(): void {
    if (this.keyRotationTimer) {
      clearInterval(this.keyRotationTimer);
    }
    
    // 메모리에서 키 정보 삭제
    this.keys.clear();
    this.activeKeyId = null;
    this.removeAllListeners();
  }
}