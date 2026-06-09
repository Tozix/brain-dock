import { createHash } from 'node:crypto';
import { ApiKeyStatus, type PrismaClient } from '@brain-dock/db';

export interface RemotePrincipal {
  userId: string;
  email: string;
  role: string;
}

export interface RemoteProject {
  id: string;
  slug: string;
  name: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hashKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** Resolve a raw API key to its owner (active key + active user), or null. Mirrors ApiKeysService. */
export async function resolveUser(
  prisma: PrismaClient,
  rawKey: string,
): Promise<RemotePrincipal | null> {
  if (!rawKey) return null;
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(rawKey) } });
  if (!key || key.status !== ApiKeyStatus.ACTIVE) return null;
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return null;

  const user = await prisma.user.findUnique({ where: { id: key.userId } });
  if (!user || !user.isActive) return null;

  // Best-effort last-used stamp.
  await prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});
  return { userId: user.id, email: user.email, role: user.role };
}

/** Resolve `X-Project` (id or slug) to a project owned by the user, or null. */
export async function resolveProject(
  prisma: PrismaClient,
  userId: string,
  ref: string,
): Promise<RemoteProject | null> {
  const project = UUID_RE.test(ref)
    ? await prisma.project.findUnique({ where: { id: ref } })
    : await prisma.project.findUnique({ where: { slug: ref } });
  if (!project || project.ownerId !== userId) return null;
  return { id: project.id, slug: project.slug, name: project.name };
}

/** Projects owned by the user (for the `list_projects` tool). */
export async function listUserProjects(
  prisma: PrismaClient,
  userId: string,
): Promise<RemoteProject[]> {
  const rows = await prisma.project.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((p) => ({ id: p.id, slug: p.slug, name: p.name }));
}
