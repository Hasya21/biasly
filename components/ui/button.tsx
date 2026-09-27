import type { ComponentProps } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-caption font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:bg-border disabled:text-muted-foreground disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/85 active:bg-primary/75",
        secondary: "border bg-surface text-foreground hover:bg-secondary active:bg-border",
        outline: "border bg-background text-foreground hover:bg-secondary active:bg-border",
        text: "bg-transparent text-foreground hover:underline active:text-muted-foreground disabled:bg-transparent",
      },
      size: { default: "h-9 px-4", sm: "h-8 px-3", icon: "size-9" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

function Button({ className, variant, size, asChild = false, type = "button", disabled, ...props }: ButtonProps) {
  const Component = asChild && !disabled ? Slot : "button";
  return <Component data-slot="button" type={asChild && !disabled ? undefined : type} disabled={disabled} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
