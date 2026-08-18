import type { ComponentProps } from "react";

import { cn } from "@/shared/libs/cn";
import { Input as ShadcnInput } from "./shadcn/input";

export type InputProps = ComponentProps<typeof ShadcnInput>;

export function Input({ className, ...props }: InputProps) {
  return <ShadcnInput className={cn("h-9 rounded-lg", className)} {...props} />;
}
