import { OPS_ROLES, ROLES, Role } from '@dm/shared';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

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
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger('Realtime');

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token: unknown = client.handshake.auth?.token;
      if (typeof token !== 'string') throw new Error('no token');
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        tid: string;
        role: Role;
        sid?: string | null;
      }>(token, { algorithms: ['HS256'] });
      if (!ROLES.includes(payload.role)) throw new Error('bad role');
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
