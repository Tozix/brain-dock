-- CreateTable
CREATE TABLE "repositories" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "root" TEXT NOT NULL,
    "default_branch" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repositories_project_id_idx" ON "repositories"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_project_id_alias_key" ON "repositories"("project_id", "alias");

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
