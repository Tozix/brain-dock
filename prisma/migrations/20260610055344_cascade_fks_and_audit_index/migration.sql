-- Add FK + ON DELETE CASCADE to all project/user-scoped tables that lacked referential
-- integrity (memory_items, knowledge_items, documents, code_symbols, code_edges,
-- mcp_usage_daily), plus an index on audit_logs.created_at for the admin read endpoint.
--
-- The three knowledge tables stored project_id as TEXT; convert in place with USING
-- (hand-edited — Prisma's draft dropped/recreated the column, which loses data).
-- Orphaned rows (project/user deleted before FKs existed) are removed first.

-- Drop rows whose project_id is not a valid uuid (cannot be cast) or has no project.
DELETE FROM "memory_items"
WHERE project_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   OR project_id::uuid NOT IN (SELECT id FROM "projects");
DELETE FROM "knowledge_items"
WHERE project_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   OR project_id::uuid NOT IN (SELECT id FROM "projects");
DELETE FROM "documents"
WHERE project_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   OR project_id::uuid NOT IN (SELECT id FROM "projects");
DELETE FROM "code_symbols" WHERE project_id NOT IN (SELECT id FROM "projects");
DELETE FROM "code_edges" WHERE project_id NOT IN (SELECT id FROM "projects");
DELETE FROM "mcp_usage_daily" WHERE user_id NOT IN (SELECT id FROM "users");

-- AlterTable (in-place cast keeps data and the existing project_id indexes)
ALTER TABLE "memory_items" ALTER COLUMN "project_id" TYPE UUID USING "project_id"::uuid;
ALTER TABLE "knowledge_items" ALTER COLUMN "project_id" TYPE UUID USING "project_id"::uuid;
ALTER TABLE "documents" ALTER COLUMN "project_id" TYPE UUID USING "project_id"::uuid;

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_symbols" ADD CONSTRAINT "code_symbols_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_edges" ADD CONSTRAINT "code_edges_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_usage_daily" ADD CONSTRAINT "mcp_usage_daily_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
