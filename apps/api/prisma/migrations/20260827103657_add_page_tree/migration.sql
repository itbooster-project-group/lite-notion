-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "parentPageId" UUID,
    "createdById" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "position" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageDocument" (
    "pageId" UUID NOT NULL,
    "tiptapSchemaVersion" INTEGER NOT NULL,
    "yjsState" BYTEA NOT NULL,
    "storageRevision" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageDocument_pkey" PRIMARY KEY ("pageId")
);

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_id_ownerId_key" ON "Project"("id", "ownerId");

-- CreateIndex
CREATE INDEX "Page_ownerId_parentPageId_position_idx" ON "Page"("ownerId", "parentPageId", "position");

-- CreateIndex
CREATE INDEX "Page_ownerId_deletedAt_idx" ON "Page"("ownerId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Page_id_ownerId_projectId_key" ON "Page"("id", "ownerId", "projectId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_projectId_ownerId_fkey" FOREIGN KEY ("projectId", "ownerId") REFERENCES "Project"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_parentPageId_ownerId_projectId_fkey" FOREIGN KEY ("parentPageId", "ownerId", "projectId") REFERENCES "Page"("id", "ownerId", "projectId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PageDocument" ADD CONSTRAINT "PageDocument_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
