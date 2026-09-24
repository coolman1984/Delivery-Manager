import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../../common/db.service';
import { journals, ledgerAccounts, ledgerLines } from '../../db/schema';

export type AccountType = (typeof ledgerAccounts.$inferSelect)['type'];
export type JournalKind = (typeof journals.$inferSelect)['kind'];

export interface PostingLine {
  accountId: string;
  /** موجب = مدين (داخل للحساب)، سالب = دائن (خارج منه) */
  amount: number;
}

export interface Posting {
  tenantId: string;
  kind: JournalKind;
  refId: string;
  description: string;
  createdBy: string | null;
  lines: PostingLine[];
}

/**
 * دفتر الحسابات بنظام القيد المزدوج:
 * كل جنيه ليه "جاي منين" و"رايح فين"، ومجموع أي قيد = صفر.
 * القيود مابتتعدلش ولا بتتمسح أبداً؛ الغلطة بتتصلح بقيد جديد عكسي.
 * نفس القواعد دي مفروضة كمان جوه قاعدة البيانات (شوف ترحيل الأمان).
 */
@Injectable()
export class LedgerService {
  async account(
    tx: Tx,
    tenantId: string,
    type: AccountType,
    ownerId: string | null = null,
  ): Promise<string> {
    const find = () =>
      tx
        .select({ id: ledgerAccounts.id })
        .from(ledgerAccounts)
        .where(
          and(
            eq(ledgerAccounts.type, type),
            ownerId ? eq(ledgerAccounts.ownerId, ownerId) : isNull(ledgerAccounts.ownerId),
          ),
        )
        .limit(1);
    const [existing] = await find();
    if (existing) return existing.id;
    await tx.insert(ledgerAccounts).values({ tenantId, type, ownerId }).onConflictDoNothing();
    const [created] = await find();
    if (!created) throw new Error('failed to create ledger account');
    return created.id;
  }

  async post(tx: Tx, posting: Posting): Promise<string> {
    const lines = posting.lines.filter((l) => l.amount !== 0);
    if (lines.length < 2) throw new BadRequestException('قيد لازم يكون فيه طرفين على الأقل');
    let sum = 0;
    for (const line of lines) {
      if (!Number.isSafeInteger(line.amount)) throw new BadRequestException('مبلغ غير صحيح');
      sum += line.amount;
    }
    if (sum !== 0) throw new Error(`unbalanced posting for ${posting.kind}:${posting.refId}`);

    const [journal] = await tx
      .insert(journals)
      .values({
        tenantId: posting.tenantId,
        kind: posting.kind,
        refId: posting.refId,
        description: posting.description,
        createdBy: posting.createdBy,
      })
      .returning({ id: journals.id });
    await tx
      .insert(ledgerLines)
      .values(
        lines.map((l) => ({
          tenantId: posting.tenantId,
          journalId: journal!.id,
          accountId: l.accountId,
          amount: l.amount,
        })),
      );
    return journal!.id;
  }

  async balance(tx: Tx, accountId: string): Promise<number> {
    const [row] = await tx
      .select({ total: sql<string>`coalesce(sum(${ledgerLines.amount}), 0)` })
      .from(ledgerLines)
      .where(eq(ledgerLines.accountId, accountId));
    return Number(row?.total ?? 0);
  }

  /** رصيد كل أصحاب حسابات من نوع معين (مثلاً: عهدة كل الطيارين) */
  async balancesByOwner(
    tx: Tx,
    type: AccountType,
    ownerIds?: string[],
  ): Promise<Map<string, number>> {
    if (ownerIds && ownerIds.length === 0) return new Map();
    const rows = await tx
      .select({
        ownerId: ledgerAccounts.ownerId,
        total: sql<string>`coalesce(sum(${ledgerLines.amount}), 0)`,
      })
      .from(ledgerAccounts)
      .leftJoin(ledgerLines, eq(ledgerLines.accountId, ledgerAccounts.id))
      .where(
        and(
          eq(ledgerAccounts.type, type),
          ownerIds ? inArray(ledgerAccounts.ownerId, ownerIds) : undefined,
        ),
      )
      .groupBy(ledgerAccounts.ownerId);
    return new Map(rows.filter((r) => r.ownerId).map((r) => [r.ownerId!, Number(r.total)]));
  }

  async totalByType(tx: Tx, type: AccountType): Promise<number> {
    const [row] = await tx
      .select({ total: sql<string>`coalesce(sum(${ledgerLines.amount}), 0)` })
      .from(ledgerLines)
      .innerJoin(ledgerAccounts, eq(ledgerLines.accountId, ledgerAccounts.id))
      .where(eq(ledgerAccounts.type, type));
    return Number(row?.total ?? 0);
  }
}
