import { Module } from '@nestjs/common';
import { UsageController } from './usage.controller';
import { UsageAdminService } from './usage-admin.service';

@Module({
  controllers: [UsageController],
  providers: [UsageAdminService],
})
export class UsageModule {}
