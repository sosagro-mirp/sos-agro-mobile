import { httpClient } from "./httpClient";

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

export const login = (email: string, password: string) =>
  httpClient.post<AuthResponse>("/api/auth/login", { email, password });

export const me = () => httpClient.get<AuthUser>("/api/auth/me");
