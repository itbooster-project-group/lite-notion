CREATE TYPE "AssetStatus" AS ENUM ('pending', 'ready', 'failed', 'deleted');

ALTER TABLE "Page" ADD COLUMN "coverAssetId" UUID;

CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'pending',
    "storageKey" TEXT NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" TEXT,
    "checksum" VARCHAR(64),
    "sizeBytes" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Asset_ready_metadata_check" CHECK (
      "status" <> 'ready' OR (
        "mimeType" IS NOT NULL AND "checksum" IS NOT NULL AND "sizeBytes" IS NOT NULL AND "sizeBytes" > 0
      )
    )
);

CREATE TABLE "PageAssetGrant" (
    "pageId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PageAssetGrant_pkey" PRIMARY KEY ("pageId", "assetId")
);

CREATE TABLE "PageAsset" (
    "pageId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "nodeId" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PageAsset_pkey" PRIMARY KEY ("pageId", "assetId", "nodeId")
);

CREATE TABLE "PageAssetProjection" (
    "pageId" UUID NOT NULL,
    "sourceStorageRevision" BIGINT,
    "attemptedStorageRevision" BIGINT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "retryAfter" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PageAssetProjection_pkey" PRIMARY KEY ("pageId"),
    CONSTRAINT "PageAssetProjection_attempt_count_check" CHECK ("attemptCount" BETWEEN 0 AND 8)
);

CREATE TABLE "UserProfile" (
    "userId" UUID NOT NULL,
    "avatarAssetId" UUID,
    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "Asset_storageKey_key" ON "Asset"("storageKey");
CREATE INDEX "Asset_uploadedById_deletedAt_idx" ON "Asset"("uploadedById", "deletedAt");
CREATE INDEX "Asset_status_createdAt_idx" ON "Asset"("status", "createdAt");
CREATE INDEX "Page_coverAssetId_idx" ON "Page"("coverAssetId");
CREATE INDEX "PageAssetGrant_assetId_idx" ON "PageAssetGrant"("assetId");
CREATE INDEX "PageAsset_assetId_idx" ON "PageAsset"("assetId");
CREATE INDEX "PageAssetProjection_sourceStorageRevision_idx" ON "PageAssetProjection"("sourceStorageRevision");
CREATE INDEX "PageAssetProjection_retryAfter_idx" ON "PageAssetProjection"("retryAfter");
CREATE INDEX "UserProfile_avatarAssetId_idx" ON "UserProfile"("avatarAssetId");

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PageAssetGrant" ADD CONSTRAINT "PageAssetGrant_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PageAssetGrant" ADD CONSTRAINT "PageAssetGrant_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PageAsset" ADD CONSTRAINT "PageAsset_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PageAsset" ADD CONSTRAINT "PageAsset_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PageAsset" ADD CONSTRAINT "PageAsset_pageId_assetId_fkey"
  FOREIGN KEY ("pageId", "assetId") REFERENCES "PageAssetGrant"("pageId", "assetId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PageAssetProjection" ADD CONSTRAINT "PageAssetProjection_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_avatarAssetId_fkey"
  FOREIGN KEY ("avatarAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Page" ADD CONSTRAINT "Page_coverAssetId_fkey"
  FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "PageAssetProjection" ("pageId", "sourceStorageRevision")
SELECT "pageId", NULL FROM "PageDocument";
