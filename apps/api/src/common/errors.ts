import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/**
 * Domain error with a stable machine-readable code. The web app translates codes
 * (errors.<CODE>) so messages are available in Arabic and English.
 */
export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    status: number = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super({ code, details }, status);
  }
}

export const notFound = (entity = 'RESOURCE') => new AppError(`${entity}_NOT_FOUND`, HttpStatus.NOT_FOUND);
export const forbidden = (code = 'FORBIDDEN') => new AppError(code, HttpStatus.FORBIDDEN);
export const conflict = (code: string, details?: unknown) => new AppError(code, HttpStatus.CONFLICT, details);

function isExclusionViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('RoomAssignment_no_overlap') || msg.includes('23P01');
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { correlationId?: string }>();
    const correlationId = req.correlationId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: { code: string; details?: unknown } = { code: 'INTERNAL_ERROR' };

    if (exception instanceof AppError) {
      status = exception.getStatus();
      body = { code: exception.code, details: exception.details };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse() as any;
      const code =
        status === 429 ? 'RATE_LIMITED' : status === 404 ? 'NOT_FOUND' : status === 413 ? 'FILE_TOO_LARGE' : status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST';
      body = { code: typeof r === 'object' && r?.code ? r.code : code };
    } else if (isExclusionViolation(exception)) {
      status = HttpStatus.CONFLICT;
      body = { code: 'ROOM_ALREADY_ALLOCATED' };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        body = { code: 'DUPLICATE', details: { target: exception.meta?.target } };
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        body = { code: 'NOT_FOUND' };
      } else if (exception.code === 'P2034') {
        status = HttpStatus.CONFLICT;
        body = { code: 'CONCURRENT_UPDATE_RETRY' };
      }
    }

    if (status >= 500) {
      // Log only the error name/message and stack; never request bodies (may contain personal data).
      const err = exception as Error;
      this.logger.error(`[${correlationId}] ${req.method} ${req.path} -> ${err?.name}: ${err?.message}`, err?.stack);
    }
    res.status(status).json({ error: body, correlationId });
  }
}
