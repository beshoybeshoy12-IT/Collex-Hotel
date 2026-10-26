import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { z } from 'zod';

// Load apps/api/.env first, then the repository root .env (values already set win).
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url(),
    API_PORT: z.coerce.number().int().default(4000),
    WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(12),
    COOKIE_SECURE: bool,
    DATA_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'DATA_ENCRYPTION_KEY must be 32 bytes base64'),
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./storage'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().default('collex-private'),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool,
    UPLOAD_MAX_MB: z.coerce.number().min(1).max(50).default(10),
    MALWARE_SCANNER: z.enum(['none', 'clamav']).default('none'),
    CLAMAV_HOST: z.string().default('localhost'),
    CLAMAV_PORT: z.coerce.number().default(3310),
    PAYMENT_PROVIDER: z.enum(['mock', 'stripe']).default('mock'),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    MOCK_WEBHOOK_SECRET: z.string().default('dev-mock-webhook-secret'),
    EMAIL_PROVIDER: z.enum(['log', 'smtp']).default('log'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().default('Collex Hotel <no-reply@example.com>'),
    SMS_PROVIDER: z.enum(['log']).default('log'),
    OCR_PROVIDER: z.enum(['none']).default('none'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.PAYMENT_PROVIDER === 'mock')
        ctx.addIssue({ code: 'custom', message: 'PAYMENT_PROVIDER=mock is not allowed in production', path: ['PAYMENT_PROVIDER'] });
      if (!env.COOKIE_SECURE)
        ctx.addIssue({ code: 'custom', message: 'COOKIE_SECURE must be true in production', path: ['COOKIE_SECURE'] });
      if (env.STORAGE_DRIVER === 'local')
        ctx.addIssue({ code: 'custom', message: 'Use STORAGE_DRIVER=s3 in production', path: ['STORAGE_DRIVER'] });
    }
    if (env.PAYMENT_PROVIDER === 'stripe' && (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET))
      ctx.addIssue({ code: 'custom', message: 'Stripe keys are required when PAYMENT_PROVIDER=stripe', path: ['STRIPE_SECRET_KEY'] });
  });

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetConfigForTests() {
  cached = undefined;
}
