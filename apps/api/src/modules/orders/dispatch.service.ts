import { distanceKm, type Point } from '@dm/shared';
import { Injectable } from '@nestjs/common';
import { and, eq, ne, sql } from 'drizzle-orm';
import type { Tx } from '../../common/db.service';
import { driverProfiles, orders, users } from '../../db/schema';

const MAX_ACTIVE_ORDERS = 3;
const FRESH_LOCATION_MS = 15 * 60_000;

export interface DriverCandidate {
  id: string;
  name: string;
  activeOrders: number;
  distanceKm: number | null;
}

/**
 * اختيار الطيار المناسب:
 * الأول الطيارين الفاضيين أو اللي معاهم أقل من ٣ طلبات،
 * ومنهم الأقرب لمكان الاستلام (لو مكانه معروف من آخر ربع ساعة)،
 * ولو المسافات مش معروفة: اللي معاه طلبات أقل.
 */
@Injectable()
export class DispatchService {
  async candidates(tx: Tx, pickup: Point | null): Promise<DriverCandidate[]> {
    const rows = await tx
      .select({
        id: users.id,
        name: users.name,
        lat: driverProfiles.lastLat,
        lng: driverProfiles.lastLng,
        seen: driverProfiles.lastSeenAt,
        active: sql<number>`(select count(*)::int from ${orders} o where o.driver_id = ${users.id} and o.status in ('placed','accepted','ready','picked_up'))`,
      })
      .from(users)
      .innerJoin(driverProfiles, eq(driverProfiles.userId, users.id))
      .where(
        and(
          eq(users.role, 'driver'),
          eq(users.isActive, true),
          ne(driverProfiles.status, 'offline'),
        ),
      );

    const now = Date.now();
    return rows
      .filter((r) => r.active < MAX_ACTIVE_ORDERS)
      .map((r) => {
        const fresh =
          r.lat !== null && r.lng !== null && r.seen && now - r.seen.getTime() < FRESH_LOCATION_MS;
        return {
          id: r.id,
          name: r.name,
          activeOrders: r.active,
          distanceKm: pickup && fresh ? distanceKm(pickup, { lat: r.lat!, lng: r.lng! }) : null,
        };
      })
      .sort(
        (a, b) =>
          (a.distanceKm ?? 999) +
            a.activeOrders * 1.5 -
            ((b.distanceKm ?? 999) + b.activeOrders * 1.5) || a.activeOrders - b.activeOrders,
      );
  }

  async best(tx: Tx, pickup: Point | null): Promise<DriverCandidate | null> {
    return (await this.candidates(tx, pickup))[0] ?? null;
  }
}
