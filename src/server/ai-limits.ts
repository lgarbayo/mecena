/**
 * Per-user rate limits on every route that calls Claude (the AI runs on the owner's key, sign-up may be open).
 * Generous on purpose: a real session, a live demo or a rehearsal never gets near them; a script does. Each route
 * has its own window, and every AI route together shares a daily allowance per user. On top of this, a global daily
 * ceiling of Claude requests (src/server/ai/budget.ts) is the last safety net.
 */
import type { User } from "@/contracts";
import { consumeLimits, type Limit } from "@/server/auth/rate-limit";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const AI_ROUTE_LIMITS = {
  "onboarding-turn": { attempts: 90, windowMs: 15 * MIN }, // a spoken chunk every few seconds while the artist talks
  "onboarding-import": { attempts: 10, windowMs: HOUR },
  "works-create": { attempts: 60, windowMs: HOUR }, // photo + vision technical sheet
  "works-describe": { attempts: 60, windowMs: HOUR },
  "call-detail": { attempts: 200, windowMs: HOUR }, // "why you fit" wording (cached per profile × call version)
  "dossier-variant": { attempts: 120, windowMs: HOUR }, // call-adapted dossier (Pro, cached)
  "dossier-design": { attempts: 40, windowMs: HOUR },
  draft: { attempts: 15, windowMs: HOUR },
  jury: { attempts: 20, windowMs: HOUR },
  "jury-improve": { attempts: 20, windowMs: HOUR },
  agent: { attempts: 40, windowMs: HOUR },
  "deep-research": { attempts: 10, windowMs: HOUR }, // it also has its own monthly caps
} as const satisfies Record<string, Limit>;
export type AiRoute = keyof typeof AI_ROUTE_LIMITS;

/** Every AI route of one user together, per day. */
export const AI_USER_DAILY_LIMIT: Limit = { attempts: 600, windowMs: DAY };

export const AI_LIMIT_MESSAGE = "Has hecho muchas peticiones a la IA en poco tiempo. Espera unos minutos y vuelve a probar.";

/**
 * Count one AI request of this user on this route: throws TooManyRequestsError (429, Spanish message) when the route's
 * window or the user's daily allowance is used up. Call it after authenticating and before any await.
 */
export function limitAi(user: Pick<User, "id">, route: AiRoute, now = Date.now()): void {
  consumeLimits(
    [
      { key: `ai:${route}:user:${user.id}`, limit: AI_ROUTE_LIMITS[route] },
      { key: `ai:all:user:${user.id}`, limit: AI_USER_DAILY_LIMIT },
    ],
    now,
    AI_LIMIT_MESSAGE,
  );
}
