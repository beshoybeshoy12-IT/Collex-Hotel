import { Controller, Get, Param, Post, Res, UploadedFiles, UseInterceptors, Body, Patch, Delete, Query } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { documentCorrectionSchema, documentMetadataSchema, documentReviewSchema, Permissions as P } from '@collex/shared';
import { Ctx, Perm, type RequestContext } from '../../common/context';
import { ZBody, ZodPipe } from '../../common/zod';
import { AppError } from '../../common/errors';
import { loadConfig } from '../../config';
import { DocumentsService } from './documents.service';

export const uploadInterceptor = () =>
  FilesInterceptor('files', 10, { limits: { fileSize: loadConfig().UPLOAD_MAX_MB * 1024 * 1024, files: 10, fields: 20 } });

/** Multipart form: `meta` (JSON string), `sides` (JSON array aligned with files), `files`. */
export function parseMultipart(body: any, files: Express.Multer.File[] | undefined) {
  let meta: unknown;
  let sides: unknown;
  try {
    meta = JSON.parse(body?.meta ?? '{}');
    sides = JSON.parse(body?.sides ?? '[]');
  } catch {
    throw new AppError('VALIDATION_FAILED');
  }
  const sideList = Array.isArray(sides) ? sides.map(String) : [];
  return {
    meta,
    files: (files ?? []).map((f, i) => ({ buffer: f.buffer, side: sideList[i] ?? 'FRONT', originalName: f.originalname })),
  };
}

@ApiTags('documents')
@ApiHeader({ name: 'x-property-id', required: true })
@Controller('v1/documents')
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Post()
  @Perm(P.DOCUMENTS_UPLOAD)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(uploadInterceptor())
  upload(@Ctx() ctx: RequestContext, @Body() body: any, @UploadedFiles() files: Express.Multer.File[]) {
    const parsed = parseMultipart(body, files);
    const meta = new ZodPipe(documentMetadataSchema).transform(parsed.meta, { type: 'body' });
    return this.svc.upload(ctx, meta, parsed.files);
  }

  @Get('review-queue')
  @Perm(P.DOCUMENTS_VIEW)
  queue(@Ctx() ctx: RequestContext) {
    return this.svc.reviewQueue(ctx);
  }

  @Get()
  @Perm(P.GUESTS_READ)
  list(@Ctx() ctx: RequestContext, @Query('guestId') guestId: string) {
    if (!guestId) throw new AppError('VALIDATION_FAILED');
    return this.svc.listForGuest(ctx, guestId);
  }

  @Get(':id')
  @Perm(P.DOCUMENTS_VIEW)
  get(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.svc.get(ctx, id);
  }

  @Get(':id/files/:fileId')
  @Perm(P.DOCUMENTS_VIEW)
  async file(@Ctx() ctx: RequestContext, @Param('id') id: string, @Param('fileId') fileId: string, @Res() res: Response) {
    const { data, mimeType } = await this.svc.readFile(ctx, id, fileId);
    res.set({
      'Content-Type': mimeType,
      'Content-Length': String(data.length),
      'Content-Disposition': 'inline',
      'Cache-Control': 'no-store, private',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    res.end(data);
  }

  @Post(':id/files')
  @Perm(P.DOCUMENTS_UPLOAD)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(uploadInterceptor())
  replace(@Ctx() ctx: RequestContext, @Param('id') id: string, @Body() body: any, @UploadedFiles() files: Express.Multer.File[]) {
    const parsed = parseMultipart(body, files);
    if (parsed.files.length !== 1) throw new AppError('FILE_REQUIRED');
    return this.svc.replaceFile(ctx, id, parsed.files[0]);
  }

  @Post(':id/review')
  @Perm(P.DOCUMENTS_VERIFY)
  review(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(documentReviewSchema) body: z.infer<typeof documentReviewSchema>) {
    return this.svc.review(ctx, id, body);
  }

  @Patch(':id')
  @Perm(P.DOCUMENTS_VERIFY)
  correct(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(documentCorrectionSchema) body: z.infer<typeof documentCorrectionSchema>) {
    return this.svc.correct(ctx, id, body);
  }

  @Delete(':id')
  @Perm(P.DOCUMENTS_DELETE)
  purge(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(z.object({ reason: z.string().min(3).max(200) })) body: { reason: string }) {
    return this.svc.purge(ctx, id, body.reason);
  }
}
