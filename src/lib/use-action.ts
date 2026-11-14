"use client";
/**
 * One user action (submit, save, pay…) that must not run twice: ignores calls while one is pending, and hands `fn` an
 * idempotency key that is reused when the same action is retried after a failure (the server then replays instead of
 * applying it again) and renewed after a success. Pass the key to apiSend(url, body, method, signal, { idempotencyKey }).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { newIdempotencyKey } from "./api-client";

const isBinary = (v: unknown) => typeof Blob !== "undefined" && v instanceof Blob;

/** Same arguments: identical values, or equal JSON for plain data (files only match by identity). */
function sameArgs(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i];
    if (Object.is(x, y)) return true;
    if (isBinary(x) || isBinary(y)) return false;
    try {
      return JSON.stringify(x) === JSON.stringify(y);
    } catch {
      return false;
    }
  });
}

export function useAction<A extends unknown[], R>(fn: (idempotencyKey: string, ...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const busy = useRef(false);
  const failed = useRef<{ key: string; args: A } | null>(null);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    if (busy.current) return undefined;
    busy.current = true;
    setPending(true);
    setError(null);
    const key = failed.current && sameArgs(failed.current.args, args) ? failed.current.key : newIdempotencyKey();
    try {
      const result = await fnRef.current(key, ...args);
      failed.current = null;
      return result;
    } catch (e) {
      failed.current = { key, args };
      setError(e);
      return undefined;
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, []);

  const reset = useCallback(() => {
    failed.current = null;
    setError(null);
  }, []);

  return { run, pending, error, reset };
}
