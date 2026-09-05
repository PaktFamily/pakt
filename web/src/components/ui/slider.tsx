import * as SliderPrimitive from "@radix-ui/react-slider";
import type { ComponentProps } from "react";

import { cn } from "../../lib/utils";

export function Slider({ className, ...props }: ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root className={cn("fee-range relative flex h-5 w-full touch-none select-none items-center", className)} {...props}>
      <SliderPrimitive.Track className="fee-range-track relative h-1.5 grow overflow-hidden rounded-full">
        <SliderPrimitive.Range className="fee-range-fill absolute h-full" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="fee-range-thumb block size-5 rounded-full border-4 outline-none" />
    </SliderPrimitive.Root>
  );
}
