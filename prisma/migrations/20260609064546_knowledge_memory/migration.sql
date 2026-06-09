-- CreateEnum
CREATE TYPE "MemoryType" AS ENUM ('DECISION', 'FACT', 'NOTE', 'TODO');

-- CreateEnum
CREATE TYPE "KnowledgeType" AS ENUM ('BUSINESS_RULE', 'ARCHITECTURE', 'REQUIREMENT', 'ADR', 'FAQ', 'RESEARCH', 'NOTE');

-- CreateTable
CREATE TABLE "memory_items" (
    "id" UUID NOT NULL,
    "project_id" TEXT NOT NULL,
    "type" "MemoryType" NOT NULL DEFAULT 'NOTE',
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_items" (
    "id" UUID NOT NULL,
    "project_id" TEXT NOT NULL,
    "type" "KnowledgeType" NOT NULL DEFAULT 'NOTE',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memory_items_project_id_idx" ON "memory_items"("project_id");

-- CreateIndex
CREATE INDEX "knowledge_items_project_id_idx" ON "knowledge_items"("project_id");
