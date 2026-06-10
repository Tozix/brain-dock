import { Role } from '@brain-dock/shared';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { AuditService } from '../audit/audit.service';
import type { AccessTokenPayload, AuthenticatedUser } from '../common/auth-user';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CredentialsDto } from './auth.dto';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /** The very first registered user is bootstrapped as SUPER_ADMIN. */
  async register(dto: CredentialsDto): Promise<AuthResult> {
    const existing = await this.prisma.client.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    const isFirstUser = (await this.prisma.client.user.count()) === 0;
    const passwordHash = await Bun.password.hash(dto.password);
    const user = await this.prisma.client.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: isFirstUser ? Role.SUPER_ADMIN : Role.USER,
      },
    });

    await this.audit.log({ actorId: user.id, action: 'user.register' });
    return this.issueTokens({ id: user.id, email: user.email, role: user.role });
  }

  async login(dto: CredentialsDto): Promise<AuthResult> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: dto.email },
    });
    if (!user?.isActive) throw new UnauthorizedException('Invalid credentials');

    const valid = await Bun.password.verify(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.audit.log({ actorId: user.id, action: 'user.login' });
    return this.issueTokens({ id: user.id, email: user.email, role: user.role });
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    let sub: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(refreshToken, {
        secret: this.config.env.JWT_REFRESH_SECRET,
        // Pin the algorithm: never accept tokens signed with anything but HS256.
        algorithms: ['HS256'],
      });
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.client.user.findUnique({ where: { id: sub } });
    if (!user?.isActive) throw new UnauthorizedException('Invalid refresh token');

    return this.issueTokens({ id: user.id, email: user.email, role: user.role });
  }

  private async issueTokens(user: AuthenticatedUser): Promise<AuthResult> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.env.JWT_ACCESS_SECRET,
      expiresIn: this.config.env.JWT_ACCESS_TTL as JwtSignOptions['expiresIn'],
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id },
      {
        secret: this.config.env.JWT_REFRESH_SECRET,
        expiresIn: this.config.env.JWT_REFRESH_TTL as JwtSignOptions['expiresIn'],
      },
    );
    return { accessToken, refreshToken, user };
  }
}
