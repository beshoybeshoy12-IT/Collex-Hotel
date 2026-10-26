import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import Stripe from 'stripe';
import { currencyDecimals, Decimal } from '@collex/shared';
import { loadConfig } from '../../config';
import { AppError } from '../../common/errors';

export interface ProviderEvent {
  eventId: string;
  type: 'payment.succeeded' | 'payment.failed' | 'payment.disputed' | 'refund.succeeded' | 'ignored';
  providerRef: string | null;
  raw: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  createIntent(input: { amount: string; currency: string; idempotencyKey: string; metadata: Record<string, string> }): Promise<{ providerRef: string; clientSecret: string | null }>;
  refund(input: { providerRef: string; amount: string; currency: string; idempotencyKey: string }): Promise<{ providerRef: string; status: 'SUCCEEDED' | 'PENDING' }>;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ProviderEvent;
}

/** Minor units conversion without floating point. */
export function toMinorUnits(amount: string, currency: string): number {
  const decimals = currencyDecimals(currency);
  return new Decimal(amount).times(new Decimal(10).pow(decimals)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * DEVELOPMENT-ONLY provider. Creates intents locally; success is only recorded when a webhook
 * signed with MOCK_WEBHOOK_SECRET is received (simulating the real provider's trusted callback).
 * Refused at startup when NODE_ENV=production (see config.ts).
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  private counter = 0;
  async createIntent(input: { idempotencyKey: string }) {
    const ref = `mock_pi_${createHmac('sha256', 'ref').update(input.idempotencyKey).digest('hex').slice(0, 20)}`;
    return { providerRef: ref, clientSecret: `${ref}_secret` };
  }
  async refund(input: { providerRef: string }) {
    this.counter++;
    return { providerRef: `mock_re_${input.providerRef.slice(-8)}_${Date.now()}_${this.counter}`, status: 'SUCCEEDED' as const };
  }
  static sign(body: string) {
    return createHmac('sha256', loadConfig().MOCK_WEBHOOK_SECRET).update(body).digest('hex');
  }
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ProviderEvent {
    const sig = String(headers['x-mock-signature'] ?? '');
    const expected = MockPaymentProvider.sign(rawBody.toString('utf8'));
    if (!sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      throw new AppError('WEBHOOK_SIGNATURE_INVALID', 400);
    }
    const body = JSON.parse(rawBody.toString('utf8'));
    return { eventId: String(body.id), type: body.type, providerRef: body.data?.providerRef ?? null, raw: body };
  }
}

/** Stripe adapter using the official SDK. Not verified in this environment (no credentials). */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';
  private readonly stripe = new Stripe(loadConfig().STRIPE_SECRET_KEY ?? '');
  async createIntent(input: { amount: string; currency: string; idempotencyKey: string; metadata: Record<string, string> }) {
    const pi = await this.stripe.paymentIntents.create(
      { amount: toMinorUnits(input.amount, input.currency), currency: input.currency.toLowerCase(), metadata: input.metadata, automatic_payment_methods: { enabled: true } },
      { idempotencyKey: input.idempotencyKey },
    );
    return { providerRef: pi.id, clientSecret: pi.client_secret };
  }
  async refund(input: { providerRef: string; amount: string; currency: string; idempotencyKey: string }) {
    const r = await this.stripe.refunds.create(
      { payment_intent: input.providerRef, amount: toMinorUnits(input.amount, input.currency) },
      { idempotencyKey: input.idempotencyKey },
    );
    return { providerRef: r.id, status: r.status === 'succeeded' ? ('SUCCEEDED' as const) : ('PENDING' as const) };
  }
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ProviderEvent {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, String(headers['stripe-signature'] ?? ''), loadConfig().STRIPE_WEBHOOK_SECRET ?? '');
    } catch {
      throw new AppError('WEBHOOK_SIGNATURE_INVALID', 400);
    }
    const obj = event.data.object as any;
    const map: Record<string, ProviderEvent['type']> = {
      'payment_intent.succeeded': 'payment.succeeded',
      'payment_intent.payment_failed': 'payment.failed',
      'charge.dispute.created': 'payment.disputed',
    };
    const ref = event.type.startsWith('charge.') ? obj.payment_intent : obj.id;
    return { eventId: event.id, type: map[event.type] ?? 'ignored', providerRef: ref ?? null, raw: { id: event.id, type: event.type } };
  }
}

@Injectable()
export class PaymentProviders {
  private readonly online: PaymentProvider;
  constructor() {
    this.online = loadConfig().PAYMENT_PROVIDER === 'stripe' ? new StripePaymentProvider() : new MockPaymentProvider();
  }
  get onlineProvider() {
    return this.online;
  }
  byName(name: string): PaymentProvider {
    if (name !== this.online.name) throw new AppError('PROVIDER_NOT_CONFIGURED', 404);
    return this.online;
  }
}
