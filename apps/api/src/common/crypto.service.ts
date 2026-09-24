import { Inject, Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { ENV, type Env } from '../config/env';

/**
 * تشفير البيانات الحساسة (زي الرقم القومي) بـ AES-256-GCM:
 * حتى لو حد سرق نسخة من قاعدة البيانات، مش هيقدر يقراها من غير المفتاح.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(@Inject(ENV) env: Env) {
    this.key = Buffer.from(env.DATA_ENCRYPTION_KEY, 'hex');
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      data.toString('base64url'),
    ].join('.');
  }

  decrypt(payload: string): string {
    const [version, iv, tag, data] = payload.split('.');
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('invalid ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  hmac(value: string): string {
    return createHmac('sha256', this.key).update(value).digest('hex');
  }

  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }
}
