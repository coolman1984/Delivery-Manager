import { BadRequestException, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Actor } from '../../common/auth-context';
import { DbService } from '../../common/db.service';

const LATE_MINUTES = 60;

interface Range {
  from: string;
  to: string;
}

/**
 * التقارير: كل الأرقام بتتحسب من قاعدة البيانات مباشرة، وبتوقيت القاهرة.
 * كله جوه عزل الشركة، فكل شركة بتشوف أرقامها بس.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly dbs: DbService) {}

  private assertRange({ from, to }: Range): void {
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (!(days >= 0) || days > 366) throw new BadRequestException('الفترة لازم تكون من يوم لسنة');
  }

  async report(actor: Actor, range: Range) {
    this.assertRange(range);
    const { from, to } = range;
    const inRange = sql`(o.placed_at at time zone 'Africa/Cairo')::date between ${from}::date and ${to}::date`;

    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const rows = async <T>(q: ReturnType<typeof sql>) => (await tx.execute(q)).rows as T[];

      const [totals] = await rows<Record<string, number>>(sql`
        select
          count(*)::int as orders,
          count(*) filter (where o.status = 'delivered')::int as delivered,
          count(*) filter (where o.status = 'cancelled')::int as cancelled,
          count(*) filter (where o.status = 'rejected')::int as rejected,
          count(*) filter (where o.type = 'errand')::int as errands,
          coalesce(sum(o.subtotal) filter (where o.status = 'delivered'), 0)::int as sales,
          coalesce(sum(o.commission_amount) filter (where o.status = 'delivered'), 0)::int as commission,
          coalesce(sum(o.delivery_fee) filter (where o.status = 'delivered'), 0)::int as delivery_fees,
          coalesce(sum(o.discount) filter (where o.status = 'delivered'), 0)::int as discounts,
          coalesce(avg(extract(epoch from o.delivered_at - o.placed_at) / 60) filter (where o.status = 'delivered'), 0)::float as avg_minutes,
          count(*) filter (where o.status = 'delivered' and o.delivered_at - o.placed_at > make_interval(mins => ${LATE_MINUTES}))::int as late,
          count(distinct o.customer_id)::int as customers
        from orders o where ${inRange}`);

      const series = await rows(sql`
        select to_char((o.placed_at at time zone 'Africa/Cairo')::date, 'YYYY-MM-DD') as date,
          count(*)::int as orders,
          count(*) filter (where o.status = 'delivered')::int as delivered,
          coalesce(sum(o.commission_amount + o.delivery_fee - o.discount) filter (where o.status = 'delivered'), 0)::int as revenue,
          coalesce(sum(o.subtotal) filter (where o.status = 'delivered'), 0)::int as sales
        from orders o where ${inRange}
        group by 1 order by 1`);

      const zones = await rows(sql`
        select z.name, count(*)::int as orders,
          count(*) filter (where o.status = 'delivered')::int as delivered,
          coalesce(sum(o.subtotal) filter (where o.status = 'delivered'), 0)::int as sales
        from orders o join zones z on z.id = o.zone_id
        where ${inRange} group by z.name order by orders desc`);

      const stores = await rows(sql`
        select s.name, count(o.id)::int as orders,
          count(o.id) filter (where o.status = 'delivered')::int as delivered,
          count(o.id) filter (where o.status = 'rejected')::int as rejected,
          coalesce(sum(o.subtotal) filter (where o.status = 'delivered'), 0)::int as sales,
          coalesce(sum(o.commission_amount) filter (where o.status = 'delivered'), 0)::int as commission,
          coalesce(avg(extract(epoch from o.ready_at - o.accepted_at) / 60) filter (where o.ready_at is not null), 0)::float as avg_prep_minutes,
          (select round(avg(r.store_rating)::numeric, 1)::float from ratings r where r.store_id = s.id) as rating
        from orders o join stores s on s.id = o.store_id
        where ${inRange} group by s.id, s.name order by sales desc`);

      const drivers = await rows(sql`
        select u.name, count(o.id) filter (where o.status = 'delivered')::int as deliveries,
          coalesce(avg(extract(epoch from o.delivered_at - o.picked_up_at) / 60) filter (where o.status = 'delivered'), 0)::float as avg_trip_minutes,
          coalesce(sum(o.cash_collected) filter (where o.status = 'delivered'), 0)::int as collected,
          (select round(avg(r.driver_rating)::numeric, 1)::float from ratings r where r.driver_id = u.id) as rating,
          (select coalesce(sum(st.shortage), 0)::int from settlements st where st.driver_id = u.id
            and (st.created_at at time zone 'Africa/Cairo')::date between ${from}::date and ${to}::date) as shortages
        from orders o join users u on u.id = o.driver_id
        where ${inRange} group by u.id, u.name order by deliveries desc`);

      const cancellations = await rows(sql`
        select o.status, coalesce(o.reason, 'من غير سبب') as reason, count(*)::int as count
        from orders o where ${inRange} and o.status in ('cancelled', 'rejected')
        group by o.status, o.reason order by count desc limit 20`);

      const late = await rows(sql`
        select o.number, coalesce(s.name, 'مشوار') as store,
          round(extract(epoch from coalesce(o.delivered_at, now()) - o.placed_at) / 60)::int as minutes, o.status
        from orders o left join stores s on s.id = o.store_id
        where ${inRange} and o.status not in ('cancelled', 'rejected')
          and coalesce(o.delivered_at, now()) - o.placed_at > make_interval(mins => ${LATE_MINUTES})
        order by minutes desc limit 20`);

      const t = totals ?? {};
      return {
        range,
        totals: {
          ...t,
          net_revenue: (t.commission ?? 0) + (t.delivery_fees ?? 0) - (t.discounts ?? 0),
        },
        series,
        zones,
        stores,
        drivers,
        cancellations,
        late,
      };
    });
  }

  /** ملف الطلبات للإكسل (CSV بترميز يفهمه الإكسل بالعربي) */
  async exportOrders(actor: Actor, range: Range): Promise<string> {
    this.assertRange(range);
    const { from, to } = range;
    const data = await this.dbs.withTenant(
      actor.tenantId,
      async (tx) =>
        (
          await tx.execute(sql`
          select o.number, to_char(o.placed_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI') as placed_at,
            case o.type when 'errand' then 'مشوار' else 'توصيل' end as type,
            o.status, coalesce(s.name, '') as store, z.name as zone, o.customer_name, coalesce(d.name, '') as driver,
            o.subtotal / 100.0 as subtotal, o.delivery_fee / 100.0 as delivery_fee, o.discount / 100.0 as discount,
            o.total / 100.0 as total, o.commission_amount / 100.0 as commission,
            coalesce(o.cash_collected, 0) / 100.0 as cash_collected, coalesce(o.reason, '') as reason
          from orders o
          left join stores s on s.id = o.store_id
          join zones z on z.id = o.zone_id
          left join users d on d.id = o.driver_id
          where (o.placed_at at time zone 'Africa/Cairo')::date between ${from}::date and ${to}::date
          order by o.placed_at`)
        ).rows as Array<Record<string, unknown>>,
    );
    const header = [
      'رقم الطلب',
      'الوقت',
      'النوع',
      'الحالة',
      'المحل',
      'المنطقة',
      'العميل',
      'الطيار',
      'المنتجات',
      'التوصيل',
      'الخصم',
      'الإجمالي',
      'العمولة',
      'المحصّل',
      'السبب',
    ];
    const lines = [header, ...data.map((r) => Object.values(r))].map((cells) =>
      cells.map(csvCell).join(','),
    );
    return '﻿' + lines.join('\r\n');
  }
}

/**
 * خلية CSV آمنة: أي نص بيبدأ بـ = أو + أو - أو @ ممكن الإكسل ينفّذه كمعادلة (ثغرة معروفة)،
 * فبنحط قبله علامة ' عشان يتقرا كنص عادي.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
