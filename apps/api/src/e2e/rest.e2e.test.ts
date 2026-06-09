// Full-stack REST e2e: boots the real NestJS app against real services and drives it over HTTP.
// Gated by RUN_E2E (skipped by the normal `bun test`). Runs in the CI `e2e` job and locally with
// the infra up: RUN_E2E=1 DATABASE_URL=... QDRANT_URL=... REDIS_URL=... bun test apps/api/src/e2e

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createPrismaClient } from '@brain-dock/db';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

// AppModule is imported dynamically inside beforeAll: it pulls bullmq (native msgpackr) which only
// loads cleanly under `bun --no-addons`. A static import would crash the normal `bun test` even
// though this suite is skipped without RUN_E2E.

const e2e = process.env.RUN_E2E ? describe : describe.skip;
// Slug-safe (lowercase alphanumeric + dashes) — used in project slugs.
const RUN = `rest-${Date.now()}`;

e2e('REST API over HTTP (real stack)', () => {
  // biome-ignore lint/suspicious/noExplicitAny: Nest app handle.
  let app: any;
  let base: string;

  beforeAll(async () => {
    const { AppModule } = await import('../app.module');
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api/v1', {
      exclude: [
        { path: 'health', method: RequestMethod.GET },
        { path: 'health/ready', method: RequestMethod.GET },
      ],
    });
    await app.listen(0);
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  const json = <T>(res: Response): Promise<T> => res.json() as Promise<T>;

  it('readiness reports ok with real services', async () => {
    const res = await fetch(`${base}/health/ready`);
    expect(res.status).toBe(200);
    expect((await json<{ status: string }>(res)).status).toBe('ok');
  });

  it('rejects unauthenticated access to protected routes', async () => {
    expect((await fetch(`${base}/api/v1/projects`)).status).toBe(401);
  });

  it('registers, then authenticates project creation via Bearer and via x-api-key', async () => {
    const email = `${RUN}@brain.dock`;
    const reg = await post('/api/v1/auth/register', { email, password: 'supersecret123' });
    expect(reg.status).toBe(201);
    const { accessToken } = await json<{ accessToken: string }>(reg);

    // Bearer path.
    const viaJwt = await post(
      '/api/v1/projects',
      { name: 'Bearer', slug: `${RUN}-jwt` },
      { authorization: `Bearer ${accessToken}` },
    );
    expect(viaJwt.status).toBe(201);

    // Promote to SUPER_ADMIN (issuing keys is admin-only), re-login, issue a key.
    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    await prisma.user.update({ where: { email }, data: { role: 'SUPER_ADMIN' } });
    await prisma.$disconnect();
    const { accessToken: adminToken } = await json<{ accessToken: string }>(
      await post('/api/v1/auth/login', { email, password: 'supersecret123' }),
    );
    const { key } = await json<{ key: string }>(
      await post('/api/v1/api-keys', { name: 'e2e' }, { authorization: `Bearer ${adminToken}` }),
    );
    expect(key).toMatch(/^bd_/);

    // x-api-key path (no Bearer).
    const viaKey = await post(
      '/api/v1/projects',
      { name: 'Keyed', slug: `${RUN}-key` },
      { 'x-api-key': key },
    );
    expect(viaKey.status).toBe(201);
  });
});
