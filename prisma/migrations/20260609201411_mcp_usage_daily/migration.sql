-- CreateTable
CREATE TABLE "mcp_usage_daily" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "tokens_served" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "mcp_usage_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mcp_usage_daily_user_id_idx" ON "mcp_usage_daily"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_usage_daily_user_id_day_key" ON "mcp_usage_daily"("user_id", "day");
