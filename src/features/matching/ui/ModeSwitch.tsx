"use client";
// One-tap Creador/a <-> Pyme switch in the header. A pyme has no works screen, so switching to it from /obras
// lands on the aid it fits instead. /dossier stays: it shows the pyme's company memoria.
import { usePathname, useRouter } from "next/navigation";
import { ROUTES, type ProfileKind } from "@/contracts";
import { useApp } from "@/components/shell/AppProvider";

const CREATOR_ONLY = [ROUTES.works];

export function ModeSwitch() {
  const { profile, setMode } = useApp();
  const path = usePathname();
  const router = useRouter();
  const kind = profile?.kind ?? "creator";
  const choose = async (next: ProfileKind) => {
    if (next === kind) return;
    await setMode(next);
    if (next === "business" && CREATOR_ONLY.some((r) => path?.startsWith(r))) router.push(ROUTES.calls);
  };
  return (
    <div className="mode-switch" role="group" aria-label="Modo">
      <button aria-pressed={kind === "creator"} onClick={() => choose("creator")}>
        Creador/a
      </button>
      <button aria-pressed={kind === "business"} onClick={() => choose("business")}>
        Pyme
      </button>
    </div>
  );
}
