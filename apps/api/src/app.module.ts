import { Controller, Get, Global, Injectable, MiddlewareConsumer, Module, NestMiddleware, NestModule, Logger } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from './common/prisma.service';
import { CryptoService } from './common/crypto.service';
import { AuditService } from './common/audit.service';
import { AllExceptionsFilter } from './common/errors';
import { SecurityGuard } from './common/security.guard';
import { Public } from './common/context';
import { SessionsService } from './modules/auth/sessions.service';
import { AuthService } from './modules/auth/auth.service';
import { AuthController } from './modules/auth/auth.controller';
import { NotificationsService } from './modules/notifications/notifications.service';
import { PropertiesService } from './modules/properties/properties.service';
import { PropertiesController } from './modules/properties/properties.controller';
import { AvailabilityService } from './modules/rates/availability.service';
import { RatesController } from './modules/rates/rates.controller';
import { MalwareScanner, StorageService } from './modules/documents/storage';
import { DocumentsService } from './modules/documents/documents.service';
import { DocumentsController } from './modules/documents/documents.controller';
import { GuestsService } from './modules/guests/guests.service';
import { GuestsController } from './modules/guests/guests.controller';
import { PaymentProviders } from './modules/finance/providers';
import { FinanceService } from './modules/finance/finance.service';
import { FinanceController, WebhooksController } from './modules/finance/finance.controller';
import { ReservationsService } from './modules/reservations/reservations.service';
import { ReservationsController } from './modules/reservations/reservations.controller';
import { AssignmentsService } from './modules/frontdesk/assignments.service';
import { FrontDeskService } from './modules/frontdesk/frontdesk.service';
import { FrontDeskController } from './modules/frontdesk/frontdesk.controller';
import { OperationsService } from './modules/operations/operations.service';
import { OperationsController } from './modules/operations/operations.controller';
import { ReportsService } from './modules/reports/reports.service';
import { ReportsController } from './modules/reports/reports.controller';
import { AdminController } from './modules/admin/admin.controller';
import { PublicController } from './modules/public/public.controller';

@Controller()
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Public()
  @Get('health/ready')
  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ready' };
  }
}

/** Correlation id + structured access log (method, path, status, duration; never bodies or query strings). */
@Injectable()
class RequestLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');
  use(req: Request & { correlationId?: string }, res: Response, next: NextFunction) {
    const incoming = req.headers['x-correlation-id'];
    req.correlationId = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-correlation-id', req.correlationId);
    const start = Date.now();
    res.on('finish', () => {
      if (process.env.NODE_ENV === 'test') return;
      this.logger.log(JSON.stringify({ cid: req.correlationId, method: req.method, path: req.path.replace(/[A-Za-z0-9]{20,}/g, ':id'), status: res.statusCode, ms: Date.now() - start }));
    });
    next();
  }
}

@Global()
@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 600 }])],
  controllers: [
    HealthController,
    AuthController,
    PropertiesController,
    RatesController,
    GuestsController,
    DocumentsController,
    ReservationsController,
    FrontDeskController,
    OperationsController,
    FinanceController,
    WebhooksController,
    ReportsController,
    AdminController,
    PublicController,
  ],
  providers: [
    PrismaService,
    CryptoService,
    AuditService,
    SessionsService,
    AuthService,
    NotificationsService,
    PropertiesService,
    AvailabilityService,
    StorageService,
    MalwareScanner,
    DocumentsService,
    GuestsService,
    PaymentProviders,
    FinanceService,
    ReservationsService,
    AssignmentsService,
    FrontDeskService,
    OperationsService,
    ReportsService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SecurityGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [PrismaService, ReservationsService, DocumentsService, NotificationsService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLogMiddleware).forRoutes('*');
  }
}
