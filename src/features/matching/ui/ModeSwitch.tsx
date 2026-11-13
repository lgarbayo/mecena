"use client";
// STUB (scaffold, working baseline). Owned by WP-06: one-tap Creador/a <-> Pyme switch in the header.
import { useApp } from "@/components/shell/AppProvider";

export function ModeSwitch() {
  const { profile, setMode } = useApp();
  const kind = profile?.kind ?? "creator";
  return (
    <div className="mode-switch" role="group" aria-label="Modo">
      <button aria-pressed={kind === "creator"} onClick={() => setMode("creator")}>
        Creador/a
      </button>
      <button aria-pressed={kind === "business"} onClick={() => setMode("business")}>
        Pyme
      </button>
    </div>
  );
}
