import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { ENV, type Env } from '../../config/env';
import { Public } from '../../common/decorators';
import { TenantsService } from '../../common/tenants.service';
import { ZodPipe } from '../../common/zod.pipe';

const query = z.strictObject({ domain: z.string().max(253) });

/**
 * سيرفر الشهادات (Caddy) بيسأل هنا قبل ما يطلع شهادة أمان لعنوان جديد:
 * بنوافق بس على عناوين الشركات الموجودة وعنوان لوحة المنصة، عشان محدش يستغل السيرفر لعناوين غريبة.
 * كده أي شركة جديدة تشتغل على عنوانها فوراً من غير ما حد يلمس السيرفر.
 */
@Controller('public/domain-check')
@Public()
export class DomainCheckController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly tenants: TenantsService,
  ) {}

  @Get()
  async check(@Query(new ZodPipe(query)) q: { domain: string }): Promise<{ ok: true }> {
    const base = this.env.BASE_DOMAIN?.toLowerCase();
    const domain = q.domain.toLowerCase();
    if (!base) throw new BadRequestException();
    if (domain === this.env.PLATFORM_HOST?.toLowerCase()) return { ok: true };
    if (!domain.endsWith(`.${base}`)) throw new NotFoundException();
    const slug = domain.slice(0, -(base.length + 1));
    const tenant = await this.tenants.findBySlug(slug);
    if (!tenant) throw new NotFoundException();
    return { ok: true };
  }
}
