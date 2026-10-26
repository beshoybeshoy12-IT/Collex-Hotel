import { Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { loadConfig } from '../config';
import { maskEmail } from '@collex/shared';

export interface OutgoingMessage {
  channel: string;
  recipient: string;
  subject: string;
  text: string;
  html: string;
}

export type DeliveryOutcome = 'SENT' | 'LOGGED';

/**
 * Delivery providers. With EMAIL_PROVIDER=log / SMS_PROVIDER=log nothing leaves the system: the
 * message is recorded as LOGGED (recipient masked, body not logged). Real sending requires SMTP config.
 */
export class Delivery {
  private readonly logger = new Logger('Delivery');
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    const c = loadConfig();
    if (c.EMAIL_PROVIDER === 'smtp') {
      if (!c.SMTP_HOST) throw new Error('SMTP_HOST is required when EMAIL_PROVIDER=smtp');
      this.transporter = nodemailer.createTransport({
        host: c.SMTP_HOST,
        port: c.SMTP_PORT,
        secure: c.SMTP_PORT === 465,
        auth: c.SMTP_USER ? { user: c.SMTP_USER, pass: c.SMTP_PASSWORD } : undefined,
      });
    }
  }

  async send(msg: OutgoingMessage): Promise<DeliveryOutcome> {
    if (msg.channel === 'EMAIL' && this.transporter) {
      await this.transporter.sendMail({ from: loadConfig().SMTP_FROM, to: msg.recipient, subject: msg.subject, text: msg.text, html: msg.html });
      return 'SENT';
    }
    this.logger.log(`[no provider configured] ${msg.channel} to ${maskEmail(msg.recipient)} subject="${msg.subject.slice(0, 60)}"`);
    return 'LOGGED';
  }
}
