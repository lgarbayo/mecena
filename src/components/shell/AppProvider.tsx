"use client";
/** Client app state (scaffold-owned): active profile, RevenueCat app user id, mode switch. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { API, type Profile, type ProfileKind } from "@/contracts";
import { apiGet, apiSend } from "@/lib/api-client";

interface AppState {
  profile: Profile | null;
  appUserId: string;
  refresh(): Promise<void>;
  setMode(kind: ProfileKind): Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [appUserId, setAppUserId] = useState("");
  const refresh = useCallback(async () => {
    const r = await apiGet<{ profile: Profile; appUserId: string }>(API.profile);
    setProfile(r.profile);
    setAppUserId(r.appUserId);
  }, []);
  const setMode = useCallback(async (kind: ProfileKind) => {
    const r = await apiSend<{ profile: Profile; appUserId: string }>(API.profileMode, { kind });
    setProfile(r.profile);
    setAppUserId(r.appUserId);
  }, []);
  useEffect(() => {
    refresh().catch(console.error);
  }, [refresh]);
  return <Ctx.Provider value={{ profile, appUserId, refresh, setMode }}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppProvider>");
  return v;
}

/** Same state, or null outside <AppProvider> (components that also render standalone, e.g. the home screen in tests). */
export function useOptionalApp(): AppState | null {
  return useContext(Ctx);
}
