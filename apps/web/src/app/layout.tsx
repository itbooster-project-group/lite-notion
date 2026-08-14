import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Lite Notion",
  description: "Базовое web-приложение Lite Notion",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  const a = 1;
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
