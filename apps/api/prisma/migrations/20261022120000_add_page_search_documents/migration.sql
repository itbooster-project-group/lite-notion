CREATE TABLE "PageSearchDocument" (
    "pageId" UUID NOT NULL,
    "plainText" TEXT NOT NULL,
    "searchVector" TSVECTOR NOT NULL,
    "sourceStorageRevision" BIGINT,
    "attemptedStorageRevision" BIGINT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "retryAfter" TIMESTAMP(3),
    "lastErrorCode" VARCHAR(100),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageSearchDocument_pkey" PRIMARY KEY ("pageId")
);

CREATE INDEX "PageSearchDocument_sourceStorageRevision_idx"
    ON "PageSearchDocument"("sourceStorageRevision");

CREATE INDEX "PageSearchDocument_retryAfter_idx"
    ON "PageSearchDocument"("retryAfter");

CREATE INDEX "PageSearchDocument_searchVector_idx"
    ON "PageSearchDocument" USING GIN ("searchVector");

CREATE INDEX "Page_title_search_idx"
    ON "Page" USING GIN (to_tsvector('simple', COALESCE("title", '')));

ALTER TABLE "PageSearchDocument"
    ADD CONSTRAINT "PageSearchDocument_pageId_fkey"
    FOREIGN KEY ("pageId") REFERENCES "Page"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
