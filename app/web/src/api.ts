import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Me } from '../../shared/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Opts = { method?: string; body?: unknown; form?: FormData };

/** Calls the JSON API. Errors carry the server's user-facing message. */
export async function api<T>(path: string, opts: Opts = {}): Promise<T> {
  const init: RequestInit = { method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'), credentials: 'same-origin' };
  if (opts.form) init.body = opts.form;
  else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'content-type': 'application/json' };
  }
  const res = await fetch('/api' + path, init);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Something went wrong. Try again.');
  return data as T;
}

export const useApi = <T,>(path: string | null, key?: unknown[]) =>
  useQuery({ queryKey: key ?? [path], queryFn: () => api<T>(path!), enabled: path !== null });

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<{ me: Me | null }>('/auth/me').then((r) => r.me), staleTime: 60_000 });
}

/**
 * Runs a write and refreshes every cached query afterwards, since most writes
 * (a booking, an approval, a profile edit) change several screens at once.
 * `error` holds the last failure message for inline display.
 */
export function useAction() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => qc.invalidateQueries(),
  });
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setError(null);
    try {
      return (await m.mutateAsync(fn)) as T;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      return undefined;
    }
  }
  return { run, error, setError, busy: m.isPending };
}
