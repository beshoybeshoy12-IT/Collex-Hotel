import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { loadConfig } from '../config';

/** AES-256-GCM encryption for sensitive values and private files at rest. */
@Injectable()
export class CryptoService {
  private readonly key = Buffer.from(loadConfig().DATA_ENCRYPTION_KEY, 'base64');
  private readonly hmacKey = crypto.createHash('sha256').update(loadConfig().SESSION_SECRET).digest();

  encryptBuffer(plain: Buffer): Buffer {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
    // Format: version(1) | iv(12) | tag(16) | ciphertext
    return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), enc]);
  }

  decryptBuffer(payload: Buffer): Buffer {
    if (payload[0] !== 1) throw new Error('Unsupported ciphertext version');
    const iv = payload.subarray(1, 13);
    const tag = payload.subarray(13, 29);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(payload.subarray(29)), decipher.final()]);
  }

  encryptString(value: string): string {
    return this.encryptBuffer(Buffer.from(value, 'utf8')).toString('base64');
  }

  decryptString(value: string): string {
    return this.decryptBuffer(Buffer.from(value, 'base64')).toString('utf8');
  }

  randomToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('base64url');
  }

  sha256(value: string | Buffer): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  sign(value: string): string {
    return crypto.createHmac('sha256', this.hmacKey).update(value).digest('base64url');
  }

  safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
  }
}
