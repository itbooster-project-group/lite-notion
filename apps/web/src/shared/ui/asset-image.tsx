import Image from 'next/image';
import type { ReactNode } from 'react';

export type AssetImageProps = Readonly<{
  alt: string;
  fallback: ReactNode;
  onImageError?: () => void;
  src?: string | undefined;
  state: 'loading' | 'ready' | 'unavailable';
  className?: string;
  height?: number;
  width?: number;
}>;

export function AssetImage({
  alt,
  className,
  fallback,
  onImageError,
  src,
  state,
  height = 256,
  width = 256,
}: AssetImageProps) {
  if (state !== 'ready' || !src) return <>{fallback}</>;

  return (
    <Image
      alt={alt}
      className={className}
      height={height}
      {...(onImageError ? { onError: onImageError } : {})}
      src={src}
      unoptimized
      width={width}
    />
  );
}
