import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

import { cn } from "@/shared/libs/cn";
import { ThemeProvider } from "@/shared/ui/theme-provider";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Lite Notion",
  description: "Базовое web-приложение Lite Notion",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ru" className={cn("font-sans", inter.variable)} suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
