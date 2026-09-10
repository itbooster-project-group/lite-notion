-- CreateEnum
CREATE TYPE "PageDeletionOrigin" AS ENUM ('SELF', 'PARENT_PAGE', 'PROJECT');

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "deletedOrigin" "PageDeletionOrigin";

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Page_deletedAt_idx" ON "Page"("deletedAt");

-- CreateIndex
CREATE INDEX "Project_ownerId_deletedAt_idx" ON "Project"("ownerId", "deletedAt");

-- CreateIndex
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");

-- "Page"."deletedAt" и "Page"."deletedOrigin" — пара: оба NULL либо оба NOT NULL.
--
-- Инвариант несёт нагрузку, а не украшает схему. Отметка без источника не имеет места
-- в корзине: сборка дерева корзины подвешивает узел к родителю только когда он удалён
-- не самостоятельно, а восстановление спускается только по PARENT_PAGE. Строка с
-- deletedAt и без источника выпала бы из обеих выдач молча. Источник без отметки
-- удаления так же бессмыслен: он описывает удаление, которого не было.
--
-- Prisma не умеет выражать CHECK в schema.prisma, поэтому ограничение добавлено
-- вручную; повторить его в коде было бы слабее — проверка в приложении не защищает
-- от ручного UPDATE и от будущей миграции данных.
--
-- Backfill не нужен: до этой миграции проставлять "deletedAt" было некому — операции
-- удаления не существовало, поэтому все существующие строки имеют "deletedAt" IS NULL
-- и удовлетворяют ограничению сразу.
ALTER TABLE "Page" ADD CONSTRAINT "Page_deletedAt_deletedOrigin_paired_check"
  CHECK (("deletedAt" IS NULL) = ("deletedOrigin" IS NULL));
