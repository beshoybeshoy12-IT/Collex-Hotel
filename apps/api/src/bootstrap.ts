import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadConfig } from './config';

export async function createApp(opts: { logger?: boolean } = {}): Promise<INestApplication> {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // needed for webhook signature verification
    logger: opts.logger === false ? false : ['log', 'warn', 'error'],
  });
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-origin' } }));
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors({ origin: [config.WEB_ORIGIN], credentials: true });
  app.enableShutdownHooks();
  return app;
}

export function buildOpenApi(app: INestApplication) {
  const doc = new DocumentBuilder()
    .setTitle('Collex Hotel API')
    .setDescription('Hotel management, property management, guest registration, room allocation and booking platform. Staff endpoints use an httpOnly session cookie, the `x-property-id` header and the `x-collex-csrf: 1` header for state-changing requests.')
    .setVersion('1.0')
    .addCookieAuth('collex_sid')
    .build();
  return SwaggerModule.createDocument(app, doc);
}
