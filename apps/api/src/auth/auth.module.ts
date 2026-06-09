import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthenticationGuard } from './authentication.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [JwtModule.register({}), ApiKeysModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Global guards: authenticate (JWT or x-api-key) first, then enforce roles. @Public opts out.
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [JwtModule],
})
export class AuthModule {}
