import { OPS_ROLES, ROLES, Role } from '@dm/shared';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { RevocationService } from '../../common/revocation.service';
import { TenantsService } from '../../common/tenants.service';

interface SocketSession {
  userId: string;
  exp: number;
  ims?: number;
}

const SWEEP_MS = 30_000;

export const rooms = {
  user: (tenantId: string, userId: string) => `t:${tenantId}:u:${userId}`,
  store: (tenantId: string, storeId: string) => `t:${tenantId}:s:${storeId}`,
  ops: (tenantId: string) => `t:${tenantId}:ops`,
};

/**
 * القناة اللحظية: السيرفر بيبلّغ كل طرف أول بأول (طلب جديد، الحالة اتغيرت...).
 * كل واحد بيدخل غرف بتاعته بس، حسب التوكن الموقّع، فمحدش يسمع أخبار حد تاني.
 */
@WebSocketGateway({
  path: '/api/v1/rt',
  cors: { origin: false },
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway implements OnGatewayConnection, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger('Realtime');
  private readonly timer: NodeJS.Timeout;

  constructor(
    private readonly jwt: JwtService,
    private readonly tenants: TenantsService,
    private readonly revocation: RevocationService,
  ) {
    // الاتصال المفتوح مايعيشش أطول من التوكن بتاعه، ولا بعد قفل الحساب أو إيقاف الشركة
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private async sweep(): Promise<void> {
    if (!this.server) return;
    const now = Date.now();
    for (const socket of this.server.sockets.sockets.values()) {
      const s = socket.data as Partial<SocketSession>;
      if (!s.userId || !s.exp) continue;
      const expired = s.exp * 1000 <= now;
      if (expired || (await this.revocation.isRevoked(s.userId, s.ims))) {
        socket.emit('auth_error');
        socket.disconnect(true);
      }
    }
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token: unknown = client.handshake.auth?.token;
      if (typeof token !== 'string') throw new Error('no token');
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        tid: string;
        role: Role;
        sid?: string | null;
        exp: number;
        ims?: number;
      }>(token, { algorithms: ['HS256'] });
      if (!ROLES.includes(payload.role)) throw new Error('bad role');
      if (await this.revocation.isRevoked(payload.sub, payload.ims)) throw new Error('revoked');
      const tenant = await this.tenants.findById(payload.tid);
      if (!tenant?.active) throw new Error('tenant suspended');
      client.data = {
        userId: payload.sub,
        exp: payload.exp,
        ims: payload.ims,
      } satisfies SocketSession;
      await client.join(rooms.user(payload.tid, payload.sub));
      if (payload.role === 'store' && payload.sid)
        await client.join(rooms.store(payload.tid, payload.sid));
      if (OPS_ROLES.includes(payload.role)) await client.join(rooms.ops(payload.tid));
    } catch {
      client.emit('auth_error');
      client.disconnect(true);
    }
  }
}
