-- CreateEnum
CREATE TYPE "SnapshotReason" AS ENUM ('automatic', 'manual', 'publication', 'restore');

-- CreateTable
CREATE TABLE "DocumentSnapshot" (
    "id" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "createdById" UUID,
    "revision" BIGINT NOT NULL,
    "sourceStorageRevision" BIGINT NOT NULL,
    "tiptapSchemaVersion" INTEGER NOT NULL,
    "yjsState" BYTEA NOT NULL,
    "reason" "SnapshotReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentSnapshot_pageId_revision_idx" ON "DocumentSnapshot"("pageId", "revision" DESC);

-- CreateIndex
CREATE INDEX "DocumentSnapshot_pageId_sourceStorageRevision_idx" ON "DocumentSnapshot"("pageId", "sourceStorageRevision" DESC);

-- CreateIndex
CREATE INDEX "DocumentSnapshot_createdById_idx" ON "DocumentSnapshot"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSnapshot_pageId_revision_key" ON "DocumentSnapshot"("pageId", "revision");

-- AddForeignKey
ALTER TABLE "DocumentSnapshot" ADD CONSTRAINT "DocumentSnapshot_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSnapshot" ADD CONSTRAINT "DocumentSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
