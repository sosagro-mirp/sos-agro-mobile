import { secureStorage } from "../storage/secureStorage";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;

export class NetworkError extends Error {
  constructor(message = "Sin conexión a internet") {
    super(message);
    this.name = "NetworkError";
  }
}

export class ServerError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ServerError";
  }
}

async function buildHeaders(extra?: HeadersInit): Promise<HeadersInit> {
  const token = await secureStorage.getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

async function attempt(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetchWithTimeout(url, options);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new NetworkError("Tiempo de espera agotado");
    }
    throw new NetworkError();
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: HeadersInit,
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const headers = await buildHeaders(extraHeaders);
  const options: RequestInit = {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  let lastError: Error = new NetworkError();

  for (let attempt_ = 0; attempt_ <= MAX_RETRIES; attempt_++) {
    if (attempt_ > 0) {
      await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** (attempt_ - 1), 60_000)));
    }

    const res = await attempt(url, options);

    if (res.ok) {
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      if (!text.trim()) return null as T;
      return JSON.parse(text) as T;
    }

    // 4xx → error de cliente, no reintentar
    if (res.status >= 400 && res.status < 500) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      const message = (body?.message as string) ?? `Error ${res.status}`;
      throw new ServerError(res.status, message);
    }

    // 5xx → reintentar
    lastError = new ServerError(res.status, `Error del servidor (${res.status})`);
  }

  throw lastError;
}

export const httpClient = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
