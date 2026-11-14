"use client";
/**
 * Client app state (scaffold-owned): the signed-in user, their active profile, their RevenueCat app user id and the
 * mode switch. Identity is the session cookie; the server never trusts the ids the client sends back.
 * A 401 anywhere (see lib/api-client) sends the browser to /entrar.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { API, ROUTES, type Profile, type ProfileKind } from "@/contracts";
import type { AuthUser, MeResponse } from "@/contracts/api";
import { apiGet, apiSend } from "@/lib/api-client";

interface AppState {
  user: AuthUser | null;
  profile: Profile | null;
  appUserId: string;
  refresh(): Promise<void>;
  setMode(kind: ProfileKind): Promise<void>;
  logout(): Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const path = usePathname();
  const onLogin = path?.startsWith(ROUTES.login) ?? false;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [appUserId, setAppUserId] = useState("");
  const refresh = useCallback(async () => {
    const r = await apiGet<MeResponse>(API.authMe); // 401 -> redirect to /entrar (api-client)
    setUser(r.user);
    setProfile(r.profile);
    setAppUserId(r.appUserId);
  }, []);
  const setMode = useCallback(async (kind: ProfileKind) => {
    const r = await apiSend<{ profile: Profile; appUserId: string }>(API.profileMode, { kind });
    setProfile(r.profile);
    setAppUserId(r.appUserId);
  }, []);
  const logout = useCallback(async () => {
    await apiSend(API.authLogout, {}).catch(() => undefined);
    setUser(null);
    setProfile(null);
    setAppUserId("");
    window.location.assign(ROUTES.login);
  }, []);
  useEffect(() => {
    if (onLogin) return; // the sign-in page has no session yet
    refresh().catch(console.error);
  }, [refresh, onLogin]);
  return <Ctx.Provider value={{ user, profile, appUserId, refresh, setMode, logout }}>{children}</Ctx.Provider>;
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
