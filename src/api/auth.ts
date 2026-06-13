const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export interface AuthUser {
  userId: string;
  name: string;
  lastName: string;
  email: string;
  role: string | null;
  mustChangePassword: boolean;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("Correo o contraseña incorrectos");
    if (res.status === 429) throw new Error("Demasiados intentos. Espera un momento.");
    throw new Error("Error al iniciar sesión. Intenta nuevamente.");
  }

  return res.json() as Promise<AuthResponse>;
}

export async function me(token: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error("Sesión expirada");

  return res.json() as Promise<AuthUser>;
}
