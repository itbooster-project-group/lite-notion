"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { ThemeProvider } from "./theme-provider";

type AppProvidersProps = Readonly<{
  children: ReactNode;
}>;

const shouldEnableBrowserMocking =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_API_MOCKING === "enabled";

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [mockingReady, setMockingReady] = useState(!shouldEnableBrowserMocking);
  const [mockingError, setMockingError] = useState<Error>();

  useEffect(() => {
    if (!shouldEnableBrowserMocking) {
      return;
    }

    let active = true;

    void import("@/shared/api/mocks/browser")
      .then(({ startBrowserMocking }) => startBrowserMocking())
      .then(() => {
        if (active) {
          setMockingReady(true);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMockingError(
            error instanceof Error ? error : new Error("Failed to start browser API mocking"),
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (mockingError) {
    throw mockingError;
  }

  if (!mockingReady) {
    return null;
  }

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
