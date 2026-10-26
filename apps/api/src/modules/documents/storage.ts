import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as net from 'node:net';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { CryptoService } from '../../common/crypto.service';
import { loadConfig } from '../../config';

/** Private object storage. Keys are random and never derived from personal data. */
export interface PrivateStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

const KEY_PATTERN = /^[a-z0-9]{2}\/[A-Za-z0-9_-]{20,80}$/;

function assertKey(key: string) {
  // Prevents path traversal: keys are generated server-side and must match a strict pattern.
  if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
}

/** Development storage: AES-256-GCM encrypted files on local disk outside any web root. */
export class LocalEncryptedStorage implements PrivateStorage {
  private readonly root: string;
  constructor(dir: string, private readonly crypto: CryptoService) {
    this.root = path.resolve(dir);
  }
  private file(key: string) {
    assertKey(key);
    const p = path.resolve(this.root, key + '.enc');
    if (!p.startsWith(this.root + path.sep)) throw new Error('Invalid storage key');
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.file(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, this.crypto.encryptBuffer(data), { mode: 0o600 });
  }
  async get(key: string) {
    return this.crypto.decryptBuffer(await fs.readFile(this.file(key)));
  }
  async delete(key: string) {
    await fs.rm(this.file(key), { force: true });
  }
}

/** Production storage: private S3-compatible bucket with server-side encryption. */
export class S3PrivateStorage implements PrivateStorage {
  private readonly s3: S3Client;
  constructor(private readonly bucket: string) {
    const c = loadConfig();
    this.s3 = new S3Client({
      region: c.S3_REGION,
      endpoint: c.S3_ENDPOINT || undefined,
      forcePathStyle: c.S3_FORCE_PATH_STYLE,
      credentials: c.S3_ACCESS_KEY_ID ? { accessKeyId: c.S3_ACCESS_KEY_ID, secretAccessKey: c.S3_SECRET_ACCESS_KEY ?? '' } : undefined,
    });
  }
  async put(key: string, data: Buffer, contentType: string) {
    assertKey(key);
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType, ServerSideEncryption: 'AES256' }));
  }
  async get(key: string) {
    assertKey(key);
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  async delete(key: string) {
    assertKey(key);
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

@Injectable()
export class StorageService implements PrivateStorage {
  private readonly impl: PrivateStorage;
  constructor(crypto: CryptoService) {
    const c = loadConfig();
    this.impl = c.STORAGE_DRIVER === 's3' ? new S3PrivateStorage(c.S3_BUCKET) : new LocalEncryptedStorage(c.STORAGE_LOCAL_DIR, crypto);
  }
  newKey(crypto: CryptoService) {
    const id = crypto.randomToken(24);
    return `${id.slice(0, 2).toLowerCase().replace(/[^a-z0-9]/g, '0')}/${id}`;
  }
  put(key: string, data: Buffer, contentType: string) {
    return this.impl.put(key, data, contentType);
  }
  get(key: string) {
    return this.impl.get(key);
  }
  delete(key: string) {
    return this.impl.delete(key);
  }
}

// ---------------------------------------------------------------- Content validation

export type AllowedMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'application/pdf';

/** Detects file type from magic bytes. Filename extensions and client Content-Type are ignored. */
export function sniffMime(buf: Buffer): AllowedMime | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp' && ['heic', 'heix', 'mif1', 'heif'].includes(buf.subarray(8, 12).toString('ascii'))) return 'image/heic';
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') {
    // Reject PDFs with active content.
    const text = buf.toString('latin1');
    if (/\/JavaScript|\/JS\s|\/Launch|\/EmbeddedFile|\/OpenAction/.test(text)) return null;
    return 'application/pdf';
  }
  return null;
}

// ---------------------------------------------------------------- Malware scanning

export type ScanResult = 'CLEAN' | 'INFECTED' | 'SKIPPED' | 'ERROR';

@Injectable()
export class MalwareScanner {
  async scan(buf: Buffer): Promise<ScanResult> {
    const c = loadConfig();
    if (c.MALWARE_SCANNER === 'none') return 'SKIPPED';
    return new Promise<ScanResult>((resolve) => {
      const socket = net.createConnection({ host: c.CLAMAV_HOST, port: c.CLAMAV_PORT });
      let response = '';
      socket.setTimeout(15_000, () => {
        socket.destroy();
        resolve('ERROR');
      });
      socket.on('error', () => resolve('ERROR'));
      socket.on('data', (chunk) => (response += chunk.toString()));
      socket.on('end', () => resolve(/OK\s*$/.test(response.trim()) ? 'CLEAN' : /FOUND/.test(response) ? 'INFECTED' : 'ERROR'));
      socket.write('zINSTREAM\0');
      for (let i = 0; i < buf.length; i += 64 * 1024) {
        const chunk = buf.subarray(i, i + 64 * 1024);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        socket.write(len);
        socket.write(chunk);
      }
      socket.end(Buffer.alloc(4));
    });
  }
}
