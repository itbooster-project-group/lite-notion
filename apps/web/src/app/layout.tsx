import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'Lite Notion',
  description: 'Базовое web-приложение Lite Notion',
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

type Test = {
  name: string;
  age: number;
};

const user: Test = {
  name: 'some name',
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
