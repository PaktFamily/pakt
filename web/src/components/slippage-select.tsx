import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { Input } from "./ui/input";

export function SlippageSelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="slippage-select">
      <button type="button" className="slippage-trigger" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        {(value / 100).toFixed(value % 100 === 0 ? 0 : 1)}% <ChevronDown size={13} />
      </button>
      {open && (
        <div className="slippage-options">
          {[50, 100, 300].map((option) => (
            <button type="button" className={value === option ? "active" : ""} key={option} onClick={() => { onChange(option); setOpen(false); }}>
              {(option / 100).toFixed(option === 50 ? 1 : 0)}%
            </button>
          ))}
          <label>
            <span>Custom</span>
            <Input
              type="number"
              min="0.1"
              max="10"
              step="0.1"
              value={value / 100}
              onChange={(event) => onChange(Math.max(10, Math.min(1_000, Math.round(Number(event.target.value || 0) * 100))))}
            />
          </label>
        </div>
      )}
    </div>
  );
}
