import { Injectable, Logger } from '@nestjs/common';

export interface SmsProvider {
  send(phone: string, message: string): Promise<void>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

/**
 * للتجربة بس: بيطبع الرسالة في شاشة السيرفر بدل ما يبعتها.
 * السيرفر بيرفض يشتغل بيه في التشغيل الحقيقي (شوف config/env.ts).
 * لما نختار شركة رسائل، هنضيف مزود جديد بنفس الشكل ده.
 */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger('SMS');

  async send(phone: string, message: string): Promise<void> {
    this.logger.warn(`[تجربة] رسالة لـ ${phone}: ${message}`);
  }
}
