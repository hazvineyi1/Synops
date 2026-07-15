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
