/**
 * Spec 52 — Fiabilidad del disparo automático de sincronización al reconectar.
 *
 * Cubre los criterios de aceptación 3, 5 y 7 de
 * `spec/52_sincronizacion_automatica_al_reconectar.md`. El criterio 2 (abajo)
 * queda documentado pero deshabilitado — ver nota.
 *
 * DESENLACE DE LA FASE 0 (2026-07-29): la hipótesis H1 que codifican estos
 * fixtures **no se reprodujo en APK real** (`TC-052-01`), solo en Expo Go
 * (`TC-052-01b`) — es H3, una diferencia de fidelidad de `NetInfo` entre Expo
 * Go y un build nativo, no un bug del código. Por decisión explícita del
 * usuario, el spec cierra sin implementar la Fase 2 (el disparo ya funciona
 * correctamente en el entorno real). Los dos casos que ejercitan la secuencia
 * incierto→confirmado quedan en `it.skip` en vez de borrarse, para no perder
 * el registro de qué se probó y por qué no se persigue el fix.
 *
 * Defecto bajo prueba (H1, no confirmado en dispositivo real), en
 * `NetworkMonitor.handleStateChange`:
 *
 *   isReachable(state) => state.isConnected === true
 *                      && state.isInternetReachable !== false
 *
 * Al salir del modo avión NetInfo suele emitir primero
 * `{ isConnected: true, isInternetReachable: null }` — la sonda de
 * alcanzabilidad aún no concluyó. Con la lógica actual:
 *   1. isReachable = true, previouslyReachable = false → DISPARA processAll()
 *      sobre una red que todavía no cursa tráfico
 *   2. previouslyReachable queda en true
 *   3. llega `{ isConnected: true, isInternetReachable: true }` → sin
 *      transición → NO se vuelve a disparar → la cola queda pendiente hasta que
 *      el usuario pulse "Sincronizar ahora"
 *
 * Por eso NO basta con afirmar "processAll fue llamado": hoy SÍ es llamado, solo
 * que sobre el estado equivocado. Esta suite registra sobre qué estado ocurrió
 * cada disparo y exige que al menos uno caiga sobre una conexión CONFIRMADA.
 *
 * NOTA: la política de tratar `isInternetReachable === null` como ONLINE para
 * la UI es deliberada (evita falsos "sin conexión") y NO debe revertirse. La
 * distinción "confirmado vs. incierto" aplica solo al disparo de sincronización.
 */

// ─── Mock declarations (hoisted before imports) ───────────────────────────────

type EstadoNet = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  type?: string;
};

type NetInfoListener = (state: EstadoNet) => void;

let listener: NetInfoListener | null = null;

/** Etiqueta del estado vigente en el momento en que se emite cada evento. */
let etiquetaEstadoActual = 'ninguno';

/** Etiquetas de los estados sobre los que se disparó processAll(). */
const disparosSobre: string[] = [];

const mockAddEventListener = jest.fn((cb: NetInfoListener) => {
  listener = cb;
  return () => {
    listener = null;
  };
});

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: (cb: NetInfoListener) => mockAddEventListener(cb),
    fetch: jest.fn(() =>
      Promise.resolve({ isConnected: true, isInternetReachable: true }),
    ),
  },
}));

const mockProcessAll = jest.fn(() => {
  disparosSobre.push(etiquetaEstadoActual);
  return Promise.resolve();
});
const mockResetNetworkFailures = jest.fn();

jest.mock('../sync/SyncQueueService', () => ({
  SyncQueueService: {
    processAll: () => mockProcessAll(),
    resetNetworkFailures: () => mockResetNetworkFailures(),
  },
}));

const mockSetOnline = jest.fn();

jest.mock('../store/useSyncStatusStore', () => ({
  useSyncStatusStore: {
    getState: () => ({ setOnline: mockSetOnline }),
  },
}));

import { NetworkMonitor } from '../sync/NetworkMonitor';

// ─── Fixtures de estados de NetInfo ──────────────────────────────────────────

const OFFLINE: [string, EstadoNet] = [
  'offline',
  { isConnected: false, isInternetReachable: false, type: 'none' },
];

/** Reconexión en curso: conectado, pero la sonda de alcanzabilidad no concluyó. */
const INCIERTO: [string, EstadoNet] = [
  'incierto',
  { isConnected: true, isInternetReachable: null, type: 'wifi' },
];

/** Conexión confirmada y utilizable. */
const CONFIRMADO: [string, EstadoNet] = [
  'confirmado',
  { isConnected: true, isInternetReachable: true, type: 'wifi' },
];

function emitir(...estados: [string, EstadoNet][]): void {
  for (const [etiqueta, estado] of estados) {
    etiquetaEstadoActual = etiqueta;
    listener?.(estado);
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  disparosSobre.length = 0;
  etiquetaEstadoActual = 'ninguno';
  listener = null;
  NetworkMonitor.stop();
  // `previouslyReachable` es estado del singleton y sobrevive a stop(). Se
  // normaliza a "offline conocido" antes de cada caso para que todos partan
  // de la misma condición.
  NetworkMonitor.start();
  emitir(OFFLINE);
  disparosSobre.length = 0;
  mockProcessAll.mockClear();
  mockResetNetworkFailures.mockClear();
  mockSetOnline.mockClear();
});

afterEach(() => {
  NetworkMonitor.stop();
});

// ─── Criterio 2 (retirado — H3 confirmada): casos activos son sanity checks ──

describe('transición offline → online con estado intermedio incierto', () => {
  // No aplica (H3 confirmada, Fase 0 del spec 52, 2026-07-29): en APK real
  // TC-052-01 sincronizó sola en ~3.7s sin pasar por esta secuencia
  // problemática. Solo se reprodujo en Expo Go. Se deja en .skip en vez de
  // borrarse: documenta la hipótesis original y por qué se descartó el fix.
  it.skip('criterio 2 (no aplica — H3): sincroniza sobre una conexión CONFIRMADA, no solo sobre la incierta', () => {
    emitir(INCIERTO, CONFIRMADO);

    expect(disparosSobre).toContain('confirmado');
  });

  it('sanity check: la secuencia directa offline → confirmado dispara una vez', () => {
    emitir(CONFIRMADO);

    expect(disparosSobre).toEqual(['confirmado']);
  });

  it.skip('criterio 2 (no aplica — H3): si la conexión se cae antes de confirmarse, no queda disparo pendiente indebido', () => {
    emitir(INCIERTO, OFFLINE, CONFIRMADO);

    // Tras volver a offline y reconectar de verdad, debe haber exactamente un
    // disparo sobre estado confirmado.
    expect(disparosSobre).toEqual(['confirmado']);
  });

  it('resetea el contador de fallos de red antes de disparar', () => {
    emitir(CONFIRMADO);

    expect(mockResetNetworkFailures).toHaveBeenCalled();
  });
});

// ─── Criterio 3: sin ejecuciones duplicadas ──────────────────────────────────

describe('ausencia de trabajo duplicado', () => {
  it('criterio 3: una sola reconexión no produce dos processAll()', () => {
    emitir(INCIERTO, CONFIRMADO);

    expect(mockProcessAll).toHaveBeenCalledTimes(1);
  });

  it('criterio 3: eventos confirmados repetidos sin pasar por offline no re-disparan', () => {
    emitir(CONFIRMADO);
    mockProcessAll.mockClear();

    emitir(CONFIRMADO, CONFIRMADO, CONFIRMADO);

    expect(mockProcessAll).not.toHaveBeenCalled();
  });
});

// ─── Criterio 7: estando offline no se dispara nada ──────────────────────────

describe('comportamiento estando offline', () => {
  it('criterio 7: no dispara sincronización con eventos offline consecutivos', () => {
    emitir(OFFLINE, OFFLINE, OFFLINE);

    expect(mockProcessAll).not.toHaveBeenCalled();
  });
});

// ─── Criterio 5: la UI no regresa a falsos "sin conexión" ────────────────────

describe('estado reportado a la UI (no regresión)', () => {
  it('criterio 5: un estado incierto se reporta como EN LÍNEA', () => {
    emitir(INCIERTO);

    expect(mockSetOnline).toHaveBeenLastCalledWith(true);
  });

  it('criterio 5: un estado desconectado se reporta como SIN CONEXIÓN', () => {
    emitir(CONFIRMADO);
    emitir(OFFLINE);

    expect(mockSetOnline).toHaveBeenLastCalledWith(false);
  });
});
