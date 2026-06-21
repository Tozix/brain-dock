import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { IndexQueue } from '@brain-dock/core';
import { IndexStatus } from '@brain-dock/db';
import type { FileInput } from '@brain-dock/indexer';
import { CODE_COLLECTION } from '@brain-dock/search';
import { Inject, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { INDEX_QUEUE_PORT } from '../repositories/index-queue';

export interface IndexEnqueueResult {
  repositoryId: string;
  status: 'QUEUED';
}

/**
 * Upload-and-index (no server-side path / git needed): the API writes the uploaded files into a
 * throwaway staging directory shared with the workers container, marks the repository QUEUED and
 * enqueues an index job. The worker parses + embeds + persists the symbol index from that directory
 * and deletes it — so a slow/large upload no longer blocks the HTTP request (it returns 202).
 */
@Injectable()
export class IndexingService {
  private readonly collection: string;
  private readonly maxTotalBytes: number;
  private readonly stagingBase: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(INDEX_QUEUE_PORT) private readonly queue: IndexQueue,
  ) {
    this.collection = process.env.COLLECTION ?? CODE_COLLECTION;
    this.maxTotalBytes = config.env.INDEX_UPLOAD_MAX_TOTAL_BYTES;
    this.stagingBase = config.env.INDEX_STAGING_DIR;
  }

  async enqueueUpload(
    projectId: string,
    repo: string,
    repositoryId: string,
    files: FileInput[],
  ): Promise<IndexEnqueueResult> {
    // Total upload budget — a request-level backstop on top of the per-file schema limits.
    // Rejected before any staging/status change: an oversized request is the client's error.
    const totalBytes = files.reduce((sum, f) => sum + Buffer.byteLength(f.content, 'utf8'), 0);
    if (totalBytes > this.maxTotalBytes) {
      throw new PayloadTooLargeException(
        `upload of ${totalBytes} bytes exceeds INDEX_UPLOAD_MAX_TOTAL_BYTES (${this.maxTotalBytes})`,
      );
    }

    const stagingDir = join(this.stagingBase, `${repositoryId}-${randomUUID()}`);
    await this.writeStaging(stagingDir, files);
    try {
      // Stamp QUEUED before enqueueing so status readers never see a stale READY/FAILED for an
      // already-submitted job (the worker flips it INDEXING → READY/FAILED and deletes the dir).
      await this.prisma.client.repository.update({
        where: { id: repositoryId },
        data: { indexStatus: IndexStatus.QUEUED, indexError: null },
      });
      await this.queue.enqueue({
        kind: 'upload',
        projectId,
        rootDir: stagingDir,
        collection: this.collection,
        repo,
        repositoryId,
      });
    } catch (error) {
      // The job never made it to the queue — drop the staging dir so it can't leak.
      await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
    return { repositoryId, status: 'QUEUED' };
  }

  /** Write uploaded files under `stagingDir`, ignoring any path that escapes it (`..`/absolute). */
  private async writeStaging(stagingDir: string, files: FileInput[]): Promise<void> {
    await mkdir(stagingDir, { recursive: true });
    try {
      const root = resolve(stagingDir);
      for (const file of files) {
        const target = resolve(root, file.path);
        if (target !== root && !target.startsWith(root + sep)) continue; // path traversal — skip
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.content, 'utf8');
      }
    } catch (error) {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }
}
