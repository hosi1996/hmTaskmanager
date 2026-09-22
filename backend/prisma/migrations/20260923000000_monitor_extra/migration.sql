-- AlterTable
ALTER TABLE "MonitorDomain" ADD COLUMN     "keyword" TEXT,
ADD COLUMN     "logRetentionDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "port" INTEGER;

