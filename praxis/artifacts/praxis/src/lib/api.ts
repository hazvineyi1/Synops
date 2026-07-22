const base = import.meta.env.BASE_URL.replace(/\/$/, "");
export const API = `${base}/api`;

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as any).error ?? res.statusText);
  }
  // 204 No Content (e.g. DELETE) has an empty body — res.json() would throw.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Like apiFetch, but also surfaces the paging total from the X-Total-Count response header.
 * Used by list views that page server-side (e.g. the Accounts roster) so they can show
 * "N of total" and a Load more control without changing the array body other consumers rely on.
 */
export async function apiFetchMeta<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T; total: number | null }> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as any).error ?? res.statusText);
  }
  const totalHeader = res.headers.get("X-Total-Count");
  const total = totalHeader != null && totalHeader !== "" ? Number(totalHeader) : null;
  const data = (res.status === 204 ? undefined : await res.json()) as T;
  return { data, total };
}
