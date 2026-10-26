import { Controller, Get, HttpCode, Post, Req, Res, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { loginSchema, passwordResetRequestSchema, passwordResetSchema, passwordSchema, Locale } from '@collex/shared';
import { AuthService } from './auth.service';
import { cookieOptions, SESSION_COOKIE, SessionsService } from './sessions.service';
import { CurrentUser, Public, type AuthUser } from '../../common/context';
import { ZBody } from '../../common/zod';
import { loadConfig } from '../../config';

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly sessions: SessionsService) {}

  @Public()
  @Throttle({ default: { limit: loadConfig().LOGIN_RATE_LIMIT_PER_MINUTE, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@ZBody(loginSchema) body: z.infer<typeof loginSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.login(body.email, body.password, body.mfaCode, req.ip ?? null, req.headers['user-agent'] ?? null);
    res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
    return { ok: true, expiresAt: session.expiresAt };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(user.sessionId);
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    return { ok: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revokeAllForUser(user.id);
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Put('me/locale')
  async locale(@CurrentUser() user: AuthUser, @ZBody(z.object({ locale: z.enum(Locale) })) body: { locale: string }) {
    await this.auth.setLocale(user.id, body.locale);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password-reset/request')
  @HttpCode(202)
  async requestReset(@ZBody(passwordResetRequestSchema) body: { email: string }) {
    await this.auth.requestPasswordReset(body.email);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password-reset/confirm')
  @HttpCode(200)
  async reset(@ZBody(passwordResetSchema) body: { token: string; password: string }) {
    await this.auth.resetPassword(body.token, body.password);
    return { ok: true };
  }

  @Post('password')
  @HttpCode(200)
  async change(
    @CurrentUser() user: AuthUser,
    @ZBody(z.object({ current: z.string().min(1), next: passwordSchema })) body: { current: string; next: string },
  ) {
    await this.auth.changePassword(user.id, body.current, body.next);
    return { ok: true };
  }

  @Post('mfa/setup')
  @HttpCode(200)
  mfaSetup(@CurrentUser() user: AuthUser) {
    return this.auth.mfaSetup(user.id);
  }

  @Post('mfa/enable')
  @HttpCode(200)
  async mfaEnable(@CurrentUser() user: AuthUser, @ZBody(z.object({ code: z.string().regex(/^\d{6}$/) })) body: { code: string }) {
    await this.auth.mfaEnable(user.id, body.code);
    return { ok: true };
  }
}
