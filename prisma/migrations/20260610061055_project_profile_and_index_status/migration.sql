-- CreateEnum
CREATE TYPE "IndexStatus" AS ENUM ('QUEUED', 'INDEXING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "profile" TEXT;

-- AlterTable
ALTER TABLE "repositories" ADD COLUMN     "index_error" TEXT,
ADD COLUMN     "index_status" "IndexStatus",
ADD COLUMN     "indexed_file_count" INTEGER,
ADD COLUMN     "last_indexed_at" TIMESTAMP(3),
ADD COLUMN     "symbol_count" INTEGER;
