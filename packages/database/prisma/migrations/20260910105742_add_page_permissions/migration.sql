-- CreateEnum
CREATE TYPE "PageAccessMode" AS ENUM ('INHERIT', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "PagePermissionRole" AS ENUM ('VIEWER', 'EDITOR');

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "accessMode" "PageAccessMode" NOT NULL DEFAULT 'INHERIT';

-- CreateTable
CREATE TABLE "PagePermission" (
    "pageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "PagePermissionRole" NOT NULL,
    "grantedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PagePermission_pkey" PRIMARY KEY ("pageId","userId")
);

-- CreateIndex
CREATE INDEX "PagePermission_userId_pageId_idx" ON "PagePermission"("userId", "pageId");

-- CreateIndex
CREATE INDEX "PagePermission_grantedById_idx" ON "PagePermission"("grantedById");

-- AddForeignKey
ALTER TABLE "PagePermission" ADD CONSTRAINT "PagePermission_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagePermission" ADD CONSTRAINT "PagePermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagePermission" ADD CONSTRAINT "PagePermission_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
