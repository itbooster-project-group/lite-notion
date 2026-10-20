import type { LoadedPublicPublication } from '../model/public-publication';
import { renderPublicPageDocument } from './public-page-document';
import { PublicationImage } from './publication-image';

export function PublicationPage({
  publication,
}: Readonly<{ publication: LoadedPublicPublication }>) {
  const { dto, content, assetUrls, coverUrl } = publication;
  const body = renderPublicPageDocument({ assetUrls, content, schemaVersion: dto.schemaVersion });

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <article className="space-y-8">
        <header className="space-y-5">
          {coverUrl ? (
            <PublicationImage
              alt="Обложка страницы"
              className="max-h-[28rem] w-full rounded-xl object-cover"
              src={coverUrl}
            />
          ) : null}
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{dto.title}</h1>
        </header>
        <div className="public-document-content min-w-0">{body}</div>
      </article>
    </main>
  );
}
