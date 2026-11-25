import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import type * as React from 'react'
import { cn } from '@/lib/utils'

export function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      className={cn('flex rounded-lg border border-border bg-card p-[3px]', className)}
      {...props}
    />
  )
}

export function ToggleGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        'h-[34px] cursor-pointer rounded-[7px] px-3.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=on]:bg-raised data-[state=on]:text-foreground',
        className,
      )}
      {...props}
    />
  )
}
