-- CreateEnum
CREATE TYPE "DocFormat" AS ENUM ('MD', 'TXT', 'MDX', 'JSON', 'YAML', 'PDF', 'DOCX');

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "format" "DocFormat" NOT NULL DEFAULT 'MD',
    "source" TEXT,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_project_id_idx" ON "documents"("project_id");
