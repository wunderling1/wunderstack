import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

/**
 * Shape is the corner treatment (control / pill / icon). Size is the density axis
 * (sm / md / lg) shared across the design system (D18). Default is control-radius at h-10.
 */
const buttonVariantStyles = cva(
  "motion-control inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-page disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary hover:bg-primary-hover",
        secondary: "border border-border bg-surface text-text hover:bg-surface-sunk",
        ghost: "text-text hover:bg-surface-sunk",
      },
      shape: {
        control: "rounded-[var(--radius-control)]",
        pill: "rounded-[var(--radius-pill)]",
        icon: "rounded-[var(--radius-control)]",
      },
      size: {
        sm: "",
        md: "",
        lg: "",
      },
    },
    compoundVariants: [
      { shape: "control", size: "sm", class: "h-8 px-3 py-1.5 text-xs" },
      { shape: "control", size: "md", class: "h-10 px-4 py-2" },
      { shape: "control", size: "lg", class: "h-12 px-5 py-2.5" },
      { shape: "pill", size: "sm", class: "h-8 px-4 py-1.5 text-xs" },
      { shape: "pill", size: "md", class: "h-10 px-5 py-2" },
      { shape: "pill", size: "lg", class: "h-12 px-6 py-2.5" },
      { shape: "icon", size: "sm", class: "h-8 w-8" },
      { shape: "icon", size: "md", class: "h-10 w-10" },
      { shape: "icon", size: "lg", class: "h-12 w-12" },
    ],
    defaultVariants: {
      variant: "primary",
      shape: "control",
      size: "md",
    },
  },
);

type DensitySize = NonNullable<VariantProps<typeof buttonVariantStyles>["size"]>;
type LegacySize = "default" | "pill" | "icon";

export type ButtonSize = DensitySize | LegacySize;

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size">,
    Omit<VariantProps<typeof buttonVariantStyles>, "size"> {
  /**
   * Density (`sm` / `md` / `lg`). Legacy `default` / `pill` / `icon` map onto
   * `md` plus the matching shape so existing call sites typecheck.
   */
  size?: ButtonSize;
}

function resolveButtonSize(
  shape: ButtonProps["shape"],
  size: ButtonSize | null | undefined,
): Pick<VariantProps<typeof buttonVariantStyles>, "shape" | "size"> {
  if (size === "default") return { shape: shape ?? "control", size: "md" };
  if (size === "pill") return { shape: "pill", size: "md" };
  if (size === "icon") return { shape: "icon", size: "md" };
  return { shape: shape ?? "control", size: size ?? "md" };
}

export function buttonVariants(
  props: Omit<VariantProps<typeof buttonVariantStyles>, "size"> & { size?: ButtonSize } = {},
) {
  const { shape, size, ...rest } = props;
  return buttonVariantStyles({ ...rest, ...resolveButtonSize(shape, size) });
}

export function Button({ className, variant, shape, size, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, shape, size }), className)} {...props} />
  );
}
