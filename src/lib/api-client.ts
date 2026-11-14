/** Browser fetch helpers (scaffold-owned). Throws ApiClientError; status 402 means "show the paywall". */
import type { ApiError } from "@/contracts/api";

export class ApiClientError extends Error {
  constructor(readonly status: number, readonly code: ApiError["error"] | "network", message: string) {
    super(message);
    this.name = "ApiClientError";
  }
  get paymentRequired() {
    return this.status === 402;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  const err = (await res.json().catch(() => null)) as ApiError | null;
  throw new ApiClientError(res.status, err?.error ?? "internal", err?.message ?? `Error ${res.status}`);
}

export async function apiGet<T>(url: string): Promise<T> {
  return handle<T>(await fetch(url, { cache: "no-store" }));
}

export async function apiSend<T>(url: string, body: unknown, method: "POST" | "PATCH" = "POST", signal?: AbortSignal): Promise<T> {
  return handle<T>(await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal }));
}

/** Read a File/Blob as a data: URL (photos -> POST /api/works). */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
