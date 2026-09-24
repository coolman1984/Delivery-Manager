import { ORDER_STATUS_LABELS, type OrderStatus } from '@dm/shared';
import type { PushSubscribeInput } from '@dm/shared/schemas';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import webpush from 'web-push';
import { DbService } from '../../common/db.service';
import { ENV, type Env } from '../../config/env';
import { pushSubscriptions, users } from '../../db/schema';

/**
 * بنقبل بس عناوين خدمات الإشعارات الرسمية (جوجل، موزيلا، مايكروسوفت، أبل)،
 * عشان محدش يستغل السيرفر يبعت طلبات لأي عنوان تاني (حماية SSRF).
 */
const ALLOWED_PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /\.push\.services\.mozilla\.com$/,
  /\.notify\.windows\.com$/,
  /^web\.push\.apple\.com$/,
];

export interface OrderPushTarget {
  tenantId: string;
  number: number;
  status: OrderStatus;
  customerId: string;
  storeId: string | null;
  driverId: string | null;
  previousDriverId?: string | null;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger('Push');
  readonly enabled: boolean;
  readonly publicKey: string | null;

  constructor(
    @Inject(ENV) env: Env,
    private readonly dbs: DbService,
  ) {
    this.enabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
    this.publicKey = env.VAPID_PUBLIC_KEY ?? null;
    if (this.enabled)
      webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  }

  static assertAllowedEndpoint(endpoint: string): void {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new BadRequestException('عنوان إشعارات غلط');
    }
    if (url.protocol !== 'https:' || !ALLOWED_PUSH_HOSTS.some((re) => re.test(url.hostname))) {
      throw new BadRequestException('خدمة الإشعارات دي مش مدعومة');
    }
  }

  async subscribe(tenantId: string, userId: string, input: PushSubscribeInput): Promise<void> {
    PushService.assertAllowedEndpoint(input.endpoint);
    await this.dbs.withTenant(tenantId, (tx) =>
      tx
        .insert(pushSubscriptions)
        .values({
          tenantId,
          userId,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
        })
        .onConflictDoUpdate({
          target: [pushSubscriptions.tenantId, pushSubscriptions.endpoint],
          set: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth },
        }),
    );
  }

  async unsubscribe(tenantId: string, userId: string, endpoint: string): Promise<void> {
    await this.dbs.withTenant(tenantId, (tx) =>
      tx
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint))),
    );
  }

  /** إشعار لكل اللي يخصهم الطلب (بيتبعت في الخلفية، ولو فشل مابيأثرش على الطلب) */
  orderChanged(o: OrderPushTarget): void {
    if (!this.enabled) return;
    void this.sendOrder(o).catch((err: unknown) => this.logger.warn(`push failed: ${String(err)}`));
  }

  private async sendOrder(o: OrderPushTarget): Promise<void> {
    const messages: Array<{ userIds: string[]; title: string; body: string; url: string }> = [];
    messages.push({
      userIds: [o.customerId],
      title: `طلبك رقم ${o.number}`,
      body: ORDER_STATUS_LABELS[o.status],
      url: '/orders',
    });
    if (
      o.driverId &&
      o.driverId !== o.previousDriverId &&
      ['placed', 'accepted', 'ready'].includes(o.status)
    ) {
      messages.push({
        userIds: [o.driverId],
        title: 'طلب جديد ليك',
        body: `طلب رقم ${o.number}`,
        url: '/driver',
      });
    }
    if (o.status === 'placed' && o.storeId) {
      const staff = await this.dbs.withTenant(o.tenantId, (tx) =>
        tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.storeId, o.storeId!), eq(users.isActive, true))),
      );
      messages.push({
        userIds: staff.map((s) => s.id),
        title: 'طلب جديد',
        body: `طلب رقم ${o.number} مستني قبولك`,
        url: '/store',
      });
    }
    for (const m of messages) await this.sendToUsers(o.tenantId, m.userIds, m);
  }

  private async sendToUsers(
    tenantId: string,
    userIds: string[],
    payload: { title: string; body: string; url: string },
  ): Promise<void> {
    if (userIds.length === 0) return;
    const subs = await this.dbs.withTenant(tenantId, (tx) =>
      tx.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds)),
    );
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 600 },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await this.dbs.withTenant(tenantId, (tx) =>
            tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)),
          );
        }
      }
    }
  }
}
