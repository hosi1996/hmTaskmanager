-- CreateTable
CREATE TABLE "MonitorDomain" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "intervalMin" INTEGER NOT NULL DEFAULT 5,
    "checks" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "onlyProblems" BOOLEAN NOT NULL DEFAULT true,
    "location" TEXT NOT NULL DEFAULT 'both',
    "notifyTelegram" BOOLEAN NOT NULL DEFAULT true,
    "notifyPanel" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastOk" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitorDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorLog" (
    "id" UUID NOT NULL,
    "domainId" UUID NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "results" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitorDomain_enabled_lastRunAt_idx" ON "MonitorDomain"("enabled", "lastRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorDomain_projectId_domain_key" ON "MonitorDomain"("projectId", "domain");

-- CreateIndex
CREATE INDEX "MonitorLog_domainId_createdAt_idx" ON "MonitorLog"("domainId", "createdAt");

-- AddForeignKey
ALTER TABLE "MonitorDomain" ADD CONSTRAINT "MonitorDomain_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorLog" ADD CONSTRAINT "MonitorLog_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "MonitorDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

