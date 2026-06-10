import { Role } from '@brain-dock/shared';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  type ListUsersQueryDto,
  listUsersQuerySchema,
  type UpdateUserDto,
  updateUserSchema,
} from './users.dto';
import { UsersService } from './users.service';

/** Admin-only user management — ADMIN and SUPER_ADMIN (RolesGuard enforces). */
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQueryDto) {
    return this.users.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserDto,
  ) {
    return this.users.update(actor, id, dto);
  }
}
