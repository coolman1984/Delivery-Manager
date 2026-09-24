import { Injectable } from '@nestjs/common';
import { RealtimeGateway, rooms } from './realtime.gateway';

export interface OrderNotice {
  tenantId: string;
  id: string;
  number: number;
  status: string;
  customerId: string;
  storeId: string | null;
  driverId: string | null;
  previousDriverId?: string | null;
}

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  /** بلّغ كل الأطراف اللي ليهم علاقة بالطلب إنه اتغيّر */
  orderChanged(o: OrderNotice): void {
    const server = this.gateway.server;
    if (!server) return;
    const targets = [rooms.user(o.tenantId, o.customerId), rooms.ops(o.tenantId)];
    if (o.storeId) targets.push(rooms.store(o.tenantId, o.storeId));
    if (o.driverId) targets.push(rooms.user(o.tenantId, o.driverId));
    if (o.previousDriverId && o.previousDriverId !== o.driverId) {
      targets.push(rooms.user(o.tenantId, o.previousDriverId));
    }
    server.to(targets).emit('order.updated', { id: o.id, number: o.number, status: o.status });
  }

  driverChanged(tenantId: string, driverId: string, data: Record<string, unknown>): void {
    this.gateway.server?.to(rooms.ops(tenantId)).emit('driver.updated', { id: driverId, ...data });
  }
}
