CREATE TYPE "PagePublicationStatus" AS ENUM ('draft', 'published', 'unpublished');

CREATE TABLE "DocumentRendering" (
    "snapshotId" UUID NOT NULL,
    "tiptapSchemaVersion" INTEGER NOT NULL,
    "contentJson" JSONB NOT NULL,
    "pageTitle" VARCHAR(255) NOT NULL,
    "coverAssetId" UUID,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentRendering_pkey" PRIMARY KEY ("snapshotId")
);

CREATE TABLE "SnapshotAsset" (
    "snapshotId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "nodeId" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SnapshotAsset_pkey" PRIMARY KEY ("snapshotId", "assetId", "nodeId")
);

CREATE TABLE "PagePublication" (
    "id" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "snapshotId" UUID,
    "slug" VARCHAR(100) NOT NULL,
    "status" "PagePublicationStatus" NOT NULL DEFAULT 'draft',
    "seoTitle" VARCHAR(255),
    "seoDescription" TEXT,
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PagePublication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PagePublication_state_shape_check" CHECK (
      ("status" = 'draft' AND "snapshotId" IS NULL AND "publishedAt" IS NULL)
      OR ("status" = 'published' AND "snapshotId" IS NOT NULL AND "publishedAt" IS NOT NULL)
      OR ("status" = 'unpublished' AND "snapshotId" IS NOT NULL AND "publishedAt" IS NOT NULL)
    )
);

CREATE TABLE "PublicationRevalidation" (
    "id" UUID NOT NULL,
    "paths" TEXT[] NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" UUID,
    "leaseUntil" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastErrorCode" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicationRevalidation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PublicationRevalidation_paths_check" CHECK (cardinality("paths") > 0),
    CONSTRAINT "PublicationRevalidation_attempts_check" CHECK ("attempts" >= 0),
    CONSTRAINT "PublicationRevalidation_lease_pair_check" CHECK (("leaseToken" IS NULL) = ("leaseUntil" IS NULL)),
    CONSTRAINT "PublicationRevalidation_delivered_lease_check" CHECK (
      "deliveredAt" IS NULL OR ("leaseToken" IS NULL AND "leaseUntil" IS NULL)
    )
);

CREATE INDEX "DocumentRendering_coverAssetId_idx" ON "DocumentRendering"("coverAssetId");
CREATE INDEX "SnapshotAsset_assetId_idx" ON "SnapshotAsset"("assetId");
CREATE UNIQUE INDEX "PagePublication_pageId_key" ON "PagePublication"("pageId");
CREATE UNIQUE INDEX "PagePublication_slug_key" ON "PagePublication"("slug");
CREATE INDEX "PagePublication_status_snapshotId_idx" ON "PagePublication"("status", "snapshotId");
CREATE UNIQUE INDEX "PagePublication_snapshotId_pageId_key" ON "PagePublication"("snapshotId", "pageId");
CREATE INDEX "PublicationRevalidation_deliveredAt_nextAttemptAt_leaseUnti_idx"
  ON "PublicationRevalidation"("deliveredAt", "nextAttemptAt", "leaseUntil");

ALTER TABLE "DocumentRendering"
  ADD CONSTRAINT "DocumentRendering_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "DocumentSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentRendering"
  ADD CONSTRAINT "DocumentRendering_coverAssetId_fkey"
  FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SnapshotAsset"
  ADD CONSTRAINT "SnapshotAsset_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "DocumentSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SnapshotAsset"
  ADD CONSTRAINT "SnapshotAsset_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PagePublication"
  ADD CONSTRAINT "PagePublication_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PagePublication"
  ADD CONSTRAINT "PagePublication_snapshotId_pageId_fkey"
  FOREIGN KEY ("snapshotId", "pageId") REFERENCES "DocumentSnapshot"("id", "pageId") ON DELETE CASCADE ON UPDATE CASCADE;
