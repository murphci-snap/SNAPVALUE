import { useState } from "react";
import { Button } from "@/components/ui/button";

const KEY = "snapvalue-fun-v1";

export function readDisclaimerAccepted(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDisclaimerAccepted() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}

export function DisclaimerGate({ onAccept }: { onAccept: () => void }) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="hash-bg flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="bg-card w-full max-w-lg rounded-2xl p-6 shadow-[var(--shadow-border)] sm:p-8">
        <p className="display text-faint text-xs tracking-[0.2em] uppercase">SNAPVALUE</p>
        <h1 className="display mt-2 text-4xl leading-none font-semibold">For fun only</h1>
        <div className="text-muted-foreground mt-4 flex flex-col gap-3 text-sm leading-relaxed">
          <p>
            This site is entertainment. Rankings, lineups, survivor tickets, and bets are not advice. Nothing here is a
            recommendation to wager, enter a contest, or make a financial decision.
          </p>
          <p>
            Data comes from public boards, player props, and a model. It can be wrong, late, or incomplete. You are
            solely responsible for anything you do with it.
          </p>
          <p>
            SNAPVALUE, its authors, and related parties are not responsible for losses, missed plays, or any other
            outcome.
          </p>
        </div>
        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl bg-secondary px-3 py-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 size-4 shrink-0"
          />
          <span className="text-sm">
            I understand this is for fun only. I will not hold SNAPVALUE responsible for anything I do with this
            information.
          </span>
        </label>
        <Button className="mt-5 h-12 w-full" disabled={!checked} onClick={onAccept}>
          Enter SNAPVALUE
        </Button>
      </div>
    </div>
  );
}

export function DisclaimerFooter() {
  return (
    <p className="text-faint mx-auto max-w-[1440px] px-4 pb-10 text-center text-[11px] leading-relaxed lg:px-6">
      For entertainment only. Not gambling, DFS, or financial advice. You are responsible for your own decisions.
      SNAPVALUE is not liable for any result.
    </p>
  );
}
