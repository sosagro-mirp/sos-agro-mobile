// Spec 86 (C, D7): credencial verificable sin conexión, una por usuario y por
// tablet. Tras un login en línea exitoso se guarda un hash PBKDF2-SHA256 de la
// contraseña (con sal única) más el perfil, en almacenamiento cifrado. La
// contraseña en claro NUNCA se persiste (CA-14). Todo aquí es puro salvo la
// generación de la sal y el PBKDF2, que son asíncronos/aleatorios.

import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import type { AuthUser } from "../api/auth";

// ── Parámetros aprobados por el usuario (2026-09-19) — ajustables por OTA ──
export const OFFLINE_CREDENTIAL_MAX_AGE_DAYS = 30;
export const MAX_FAILED_ATTEMPTS_BEFORE_ONLINE = 10;
export const LOCKOUT_STEPS_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000];
/** Tolerancia de retroceso del reloj respecto de la marca máxima vista. */
export const CLOCK_ROLLBACK_TOLERANCE_MS = 24 * 60 * 60 * 1000;
export const MAX_KNOWN_USERS = 10;

/** Fallos a partir de los cuales empieza el bloqueo escalonado. */
const LOCKOUT_STARTS_AT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

// DEBT: valor provisional. La Fase 0 del spec 86 exige calibrarlo midiendo
// PBKDF2 en la tablet de referencia (objetivo ~0,5-1 s). Se guarda por
// registro, así que subirlo después no invalida las credenciales existentes.
export const DEFAULT_PBKDF2_ITERATIONS = 100_000;

export interface OfflineCredential {
  version: 1;
  userId: string;
  /** Siempre en minúsculas. */
  email: string;
  algorithm: "pbkdf2-sha256";
  iterations: number;
  /** Hex. */
  salt: string;
  /** Hex, 32 bytes. */
  hash: string;
  /** Último ingreso con conexión (ms). Base de la vigencia de 30 días. */
  lastOnlineLoginAt: number;
  /** Hora más alta vista por el dispositivo (ms); detecta relojes atrasados. */
  maxSeenAt: number;
  failedAttempts: number;
  lockedUntil: number | null;
  requiresOnlineLogin: boolean;
  profile: AuthUser;
}

export type OfflineLoginDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "requires_online" | "clock_rollback" | "expired" | "locked";
      lockedUntil?: number;
    };

const HASH_BYTES = 32;

function randomSalt(seed: string): Uint8Array {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
    return bytes;
  }
  // Sin CSPRNG en el binario: la sal solo necesita ser única, no secreta.
  const mixed = `${seed}|${Date.now()}|${Math.random()}|${Math.random()}`;
  return sha256(utf8ToBytes(mixed)).slice(0, 16);
}

type NativePbkdf2 = (
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keylen: number,
  digest: string,
  callback: (err: Error | null, derivedKey?: Uint8Array) => void,
) => void;

let nativePbkdf2: NativePbkdf2 | null | undefined;

// Spec 86, Fase 10: en JS puro (Hermes, sin JIT) 100.000 iteraciones tardaban
// ~30-40 s en la tablet. El módulo nativo no existe en Expo Go ni en Jest; ahí
// se usa @noble/hashes, que produce exactamente el mismo resultado.
function loadNativePbkdf2(): NativePbkdf2 | null {
  if (nativePbkdf2 !== undefined) return nativePbkdf2;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const qc = require("react-native-quick-crypto") as { pbkdf2?: NativePbkdf2 };
    nativePbkdf2 = typeof qc.pbkdf2 === "function" ? qc.pbkdf2 : null;
  } catch {
    nativePbkdf2 = null;
  }
  return nativePbkdf2;
}

function deriveNative(
  fn: NativePbkdf2,
  password: string,
  saltHex: string,
  iterations: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    fn(utf8ToBytes(password), hexToBytes(saltHex), iterations, HASH_BYTES, "sha256", (err, key) => {
      if (err || !key) reject(err ?? new Error("pbkdf2 sin resultado"));
      else resolve(new Uint8Array(key));
    });
  });
}

function deriveJs(password: string, saltHex: string, iterations: number): Promise<Uint8Array> {
  // En React Native cada cesión al event loop (setTimeout) cuesta casi tanto
  // como 10 ms de cálculo: con el tramo por defecto la espera duplicaba el
  // tiempo total. 100 ms mantiene la interfaz usable.
  return pbkdf2Async(sha256, utf8ToBytes(password), hexToBytes(saltHex), {
    c: iterations,
    dkLen: HASH_BYTES,
    asyncTick: 100,
  });
}

async function derive(password: string, saltHex: string, iterations: number): Promise<string> {
  const native = loadNativePbkdf2();
  let out: Uint8Array;
  if (native) {
    try {
      out = await deriveNative(native, password, saltHex, iterations);
    } catch {
      out = await deriveJs(password, saltHex, iterations);
    }
  } else {
    out = await deriveJs(password, saltHex, iterations);
  }
  return bytesToHex(out);
}

/** Solo para pruebas: fuerza o quita el motor nativo. */
export function __setNativePbkdf2ForTests(fn: NativePbkdf2 | null | undefined): void {
  nativePbkdf2 = fn;
}

/** Comparación en tiempo constante de dos cadenas hex. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createOfflineCredential(input: {
  userId: string;
  email: string;
  password: string;
  profile: AuthUser;
  iterations?: number;
  now?: number;
}): Promise<OfflineCredential> {
  const now = input.now ?? Date.now();
  const iterations = input.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
  const salt = bytesToHex(randomSalt(input.userId));
  return {
    version: 1,
    userId: input.userId,
    email: input.email.trim().toLowerCase(),
    algorithm: "pbkdf2-sha256",
    iterations,
    salt,
    hash: await derive(input.password, salt, iterations),
    lastOnlineLoginAt: now,
    maxSeenAt: now,
    failedAttempts: 0,
    lockedUntil: null,
    requiresOnlineLogin: false,
    profile: input.profile,
  };
}

export async function verifyOfflinePassword(
  cred: OfflineCredential,
  password: string,
): Promise<boolean> {
  if (!password) return false;
  const candidate = await derive(password, cred.salt, cred.iterations);
  return constantTimeEqual(candidate, cred.hash);
}

/** ¿Puede esta credencial usarse para entrar sin conexión ahora mismo? */
export function evaluateOfflineLogin(cred: OfflineCredential, now: number): OfflineLoginDecision {
  if (cred.requiresOnlineLogin) return { allowed: false, reason: "requires_online" };
  if (now < cred.maxSeenAt - CLOCK_ROLLBACK_TOLERANCE_MS) {
    return { allowed: false, reason: "clock_rollback" };
  }
  if (now - cred.lastOnlineLoginAt > OFFLINE_CREDENTIAL_MAX_AGE_DAYS * DAY_MS) {
    return { allowed: false, reason: "expired" };
  }
  if (cred.lockedUntil !== null && now < cred.lockedUntil) {
    return { allowed: false, reason: "locked", lockedUntil: cred.lockedUntil };
  }
  return { allowed: true };
}

/** Registra una contraseña incorrecta y aplica el bloqueo escalonado. */
export function registerFailedAttempt(cred: OfflineCredential, now: number): OfflineCredential {
  const failedAttempts = cred.failedAttempts + 1;
  let lockedUntil = cred.lockedUntil;

  if (failedAttempts >= LOCKOUT_STARTS_AT) {
    const step = Math.min(failedAttempts - LOCKOUT_STARTS_AT, LOCKOUT_STEPS_MS.length - 1);
    lockedUntil = now + LOCKOUT_STEPS_MS[step];
  }

  return {
    ...cred,
    failedAttempts,
    lockedUntil,
    requiresOnlineLogin:
      cred.requiresOnlineLogin || failedAttempts >= MAX_FAILED_ATTEMPTS_BEFORE_ONLINE,
    maxSeenAt: Math.max(cred.maxSeenAt, now),
  };
}

/** Ingreso local correcto: reinicia contador y bloqueo; no renueva la vigencia. */
export function registerSuccessfulLogin(cred: OfflineCredential, now: number): OfflineCredential {
  return {
    ...cred,
    failedAttempts: 0,
    lockedUntil: null,
    maxSeenAt: Math.max(cred.maxSeenAt, now),
  };
}

/** Lee un registro guardado; un JSON corrupto o incompleto cuenta como ausente. */
export function parseStoredCredential(raw: string | null): OfflineCredential | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const c = v as Partial<OfflineCredential>;
    const ok =
      c.version === 1 &&
      typeof c.userId === "string" &&
      typeof c.email === "string" &&
      c.algorithm === "pbkdf2-sha256" &&
      typeof c.iterations === "number" &&
      typeof c.salt === "string" &&
      typeof c.hash === "string" &&
      typeof c.lastOnlineLoginAt === "number" &&
      typeof c.maxSeenAt === "number" &&
      typeof c.failedAttempts === "number" &&
      typeof c.requiresOnlineLogin === "boolean" &&
      typeof c.profile === "object" &&
      c.profile !== null;
    return ok ? (c as OfflineCredential) : null;
  } catch {
    return null;
  }
}

/**
 * Con más de `MAX_KNOWN_USERS` usuarios, devuelve los que deben salir: los más
 * antiguos (último ingreso en línea) que no tengan pendientes.
 */
export function selectUsersToEvict(
  known: { userId: string; lastOnlineLoginAt: number }[],
  ownersWithPending: Set<string>,
): string[] {
  const excess = known.length - MAX_KNOWN_USERS;
  if (excess <= 0) return [];
  return [...known]
    .sort((a, b) => a.lastOnlineLoginAt - b.lastOnlineLoginAt)
    .filter((u) => !ownersWithPending.has(u.userId))
    .slice(0, excess)
    .map((u) => u.userId);
}
