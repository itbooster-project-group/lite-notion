'use client';

import { useState } from 'react';

export function PublicationImage({
  alt,
  className,
  src,
}: Readonly<{ alt: string; className?: string; src: string }>) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div aria-label={alt || 'Изображение недоступно'} className={className} role="img">
        Изображение недоступно
      </div>
    );
  }

  return (
    // biome-ignore lint/performance/noImgElement: Signed resolver URLs must load directly without image optimization.
    <img
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={src}
    />
  );
}
