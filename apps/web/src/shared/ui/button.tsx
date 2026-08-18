import type { ComponentProps } from "react";

import { cn } from "@/shared/lib/cn";
import { Button as ShadcnButton } from "./shadcn/button";

export type ButtonProps = ComponentProps<typeof ShadcnButton>;

export function Button({ className, ...props }: ButtonProps) {
  return <ShadcnButton className={cn("rounded-lg", className)} {...props} />;
}
