import { z } from 'zod';

// Files are uploaded by the client (e.g. the VSCode extension) so the server can index them without
// a server-side path or git. Bounded to keep request bodies sane.
export const indexFilesSchema = z.object({
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(1000),
        content: z.string().max(2_000_000),
      }),
    )
    .max(10000),
});
export type IndexFilesDto = z.infer<typeof indexFilesSchema>;
