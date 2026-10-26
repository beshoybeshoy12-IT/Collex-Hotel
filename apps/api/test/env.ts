import * as path from 'node:path';
import * as dotenv from 'dotenv';

// Tests always run against TEST_DATABASE_URL, never the development or production database.
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required for integration tests');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
(process.env as any).NODE_ENV = 'test';
process.env.STORAGE_LOCAL_DIR = path.resolve(__dirname, '../storage-test');
process.env.PAYMENT_PROVIDER = 'mock';
process.env.EMAIL_PROVIDER = 'log';
process.env.LOGIN_RATE_LIMIT_PER_MINUTE = '10000';
