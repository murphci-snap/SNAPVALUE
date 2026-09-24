import { useEffect, useState } from "react";
import { X } from "lucide-react";

const KEY = "snapvalue-howto-v1";
const SHOW_MS = 10_000;

export function readHowToDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeHowToDismissed() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}

/** One-shot strip after disclaimer accept — Val / IT / Own% / CY. */
export function HowToReadStrip({ enabled }: { enabled: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (readHowToDismissed()) return;
    setVisible(true);
    const t = window.setTimeout(() => {
      writeHowToDismissed();
      setVisible(false);
    }, SHOW_MS);
    return () => window.clearTimeout(t);
  }, [enabled]);

  if (!visible) return null;

  function dismiss() {
    writeHowToDismissed();
    setVisible(false);
  }

  return (
    <div className="border-border/60 bg-ink/10 relative mt-4 rounded-xl border px-4 py-3 pr-11 shadow-[var(--shadow-border)]">
      <p className="display text-faint text-[10px] tracking-[0.18em] uppercase">How to read the board</p>
      <ul className="text-muted-foreground mt-1.5 flex flex-col gap-1 text-sm sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-1">
        <li>
          <span className="text-value font-medium">Val</span> = pts / $1k salary
        </li>
        <li>
          <span className="text-ink font-medium">IT Factor</span> = leverage smash, not chalk
        </li>
        <li>
          <span className="font-medium text-foreground">Own%</span> = projected field ownership
        </li>
        <li>
          <span className="text-[#f0c14b] font-medium">CY</span> = contract year boost
        </li>
      </ul>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss how-to"
        className="text-muted-foreground hover:text-foreground absolute top-2 right-2 size-9"
      >
        <X className="mx-auto size-4" />
      </button>
    </div>
  );
}
