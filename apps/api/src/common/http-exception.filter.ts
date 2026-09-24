import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

interface PgError {
  code?: string;
  constraint?: string;
}

/**
 * أي خطأ غير متوقع بيرجع للمستخدم رسالة عامة من غير أي تفاصيل داخلية
 * (عشان المخترق مايعرفش حاجة عن تركيبة النظام)، والتفاصيل بتتسجل عندنا بس.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      res
        .status(exception.getStatus())
        .json(
          typeof body === 'string' ? { statusCode: exception.getStatus(), message: body } : body,
        );
      return;
    }

    const pg = this.findPgError(exception);
    if (pg?.code === '23505') {
      res
        .status(HttpStatus.CONFLICT)
        .json({ statusCode: 409, message: 'البيانات دي متسجلة قبل كده' });
      return;
    }
    if (pg?.code === '23514' || pg?.code === '23503') {
      res.status(HttpStatus.BAD_REQUEST).json({ statusCode: 400, message: 'البيانات مش مقبولة' });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: 500, message: 'حصلت مشكلة عندنا، جرّب تاني بعد شوية' });
  }

  private findPgError(err: unknown): PgError | null {
    let current: unknown = err;
    for (let i = 0; i < 3 && current && typeof current === 'object'; i++) {
      const candidate = current as PgError & { cause?: unknown };
      if (typeof candidate.code === 'string' && /^\d{2}[0-9A-Z]{3}$/.test(candidate.code))
        return candidate;
      current = candidate.cause;
    }
    return null;
  }
}
