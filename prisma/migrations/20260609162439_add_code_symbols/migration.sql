-- CreateTable
CREATE TABLE "code_symbols" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "repo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "start_line" INTEGER NOT NULL,
    "end_line" INTEGER NOT NULL,
    "routes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_symbols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_edges" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "repo" TEXT NOT NULL,
    "from_name" TEXT NOT NULL,
    "to_name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_edges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "code_symbols_project_id_repo_idx" ON "code_symbols"("project_id", "repo");

-- CreateIndex
CREATE INDEX "code_symbols_project_id_role_idx" ON "code_symbols"("project_id", "role");

-- CreateIndex
CREATE INDEX "code_symbols_project_id_name_idx" ON "code_symbols"("project_id", "name");

-- CreateIndex
CREATE INDEX "code_edges_project_id_repo_idx" ON "code_edges"("project_id", "repo");

-- CreateIndex
CREATE INDEX "code_edges_project_id_from_name_idx" ON "code_edges"("project_id", "from_name");

-- CreateIndex
CREATE INDEX "code_edges_project_id_to_name_idx" ON "code_edges"("project_id", "to_name");
