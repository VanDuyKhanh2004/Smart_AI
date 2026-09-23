import { cva } from "class-variance-authority"

const alertVariants = cva(
  "relative w-full rounded-md border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground border-border",
        destructive:
          "bg-destructive/10 text-destructive border-destructive/30 [&>svg]:text-destructive *:data-[slot=alert-description]:text-destructive/90",
        success:
          "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400 [&>svg]:text-emerald-600 *:data-[slot=alert-description]:text-emerald-700/90 dark:*:data-[slot=alert-description]:text-emerald-400/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export { alertVariants }
