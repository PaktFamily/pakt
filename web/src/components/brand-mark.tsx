import { cn } from "../lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={cn("brand-mark", className)} viewBox="0 0 32 32" aria-hidden="true">
      <path className="brand-mark-link" d="M15 5H9a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4h6" />
      <path className="brand-mark-link" d="M17 11h6a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-6" />
      <rect className="brand-mark-lock" x="13" y="13" width="6" height="6" rx="1.5" />
    </svg>
  );
}
