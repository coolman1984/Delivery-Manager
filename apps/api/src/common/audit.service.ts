import { Injectable, Logger } from '@nestjs/common';
import { auditLogs } from '../db/schema';
import type { Tx } from './db.service';

export interface AuditEntry {
  tenantId: string;
  actorId?: string | null;
  actorRole?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}

/**
 * سجل العمليات الحساسة: مين عمل إيه وإمتى ومن أنهي جهاز.
 * بيتكتب جوه نفس المعاملة، فلو العملية فشلت السجل مابيتكتبش، ولو نجحت لازم يتكتب.
 * الجدول ممنوع يتعدل أو يتمسح من قاعدة البيانات نفسها.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  async log(tx: Tx, entry: AuditEntry): Promise<void> {
    await tx.insert(auditLogs).values({
      tenantId: entry.tenantId,
      actorId: entry.actorId ?? null,
      actorRole: entry.actorRole ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      meta: entry.meta ?? null,
    });
    this.logger.log(
      `${entry.action} by ${entry.actorId ?? 'anonymous'} on ${entry.entityType ?? '-'}:${entry.entityId ?? '-'}`,
    );
  }
}
