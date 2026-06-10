import { Role } from '@brain-dock/shared';
import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { type AuditQueryDto, auditQuerySchema } from './audit.dto';
import { AuditService } from './audit.service';

/** Read access to the audit trail — ADMIN and SUPER_ADMIN only (RolesGuard enforces). */
@Roles(Role.ADMIN)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQueryDto) {
    return this.audit.list({
      actorId: query.actor,
      action: query.action,
      from: query.from,
      to: query.to,
      take: query.take,
      skip: query.skip,
    });
  }
}
