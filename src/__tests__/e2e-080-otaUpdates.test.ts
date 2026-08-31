/**
 * Spec 80 — `expo-updates` y canal OTA operativo.
 *
 * Cubre los criterios automatizables de `spec/80_expo_updates_canal_ota.md`:
 * 1, 5 (lógica), 6, 7 y 12. Los criterios 2, 3, 4, 8, 9, 10 y 11 solo se
 * verifican en un dispositivo real con un build EAS, o son documentales, y
 * viven en `docs/testing/test-080-expo-updates-canal-ota.md`.
 *
 * ARRANCA EN ROJO:
 *  - `expo-updates` todavía no está en `package.json` (Fase 1). Ese es el bug
 *    de origen: el bloque `updates` de `app.config.ts` está escrito pero es
 *    inerte, y las tablets reportan `ota_updates: is_enabled: false` en Sentry.
 *  - `app.config.ts` todavía no declara `checkAutomatically` (Fase 1).
 *  - `src/lib/otaUpdates.ts` todavía no existe (Fase 2).
 *
 * `expo-updates` se mockea de forma **virtual**: el paquete aún no está
 * instalado, así que un `jest.mock` normal fallaría al resolver el módulo. Al
 * cerrar la Fase 2 este mock virtual se sustituye por
 * `src/__tests__/__mocks__/expo-updates.ts` registrado en `moduleNameMapper`,
 * junto a los de `expo-sqlite` y `expo-file-system/legacy`.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import appConfig from '../../app.config';

const mockUpdates = {
  isEnabled: true,
  channel: 'preview',
  runtimeVersion: '1.0.0',
  updateId: '3f2a1c40-0000-4000-8000-000000000001',
  createdAt: new Date('2026-08-30T14:02:00.000Z'),
  isEmbeddedLaunch: false,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
};

jest.mock('expo-updates', () => mockUpdates, { virtual: true });

// `src/lib/otaUpdates.ts` se crea en la Fase 2. Se resuelve de forma perezosa
// para que su ausencia haga fallar solo a sus propios casos y no tumbe la
// suite entera (mismo patrón que `splashGate` en el spec 76).
type OtaStatus = {
  available: boolean;
  isEnabled: boolean | null;
  channel: string | null;
  runtimeVersion: string | null;
  updateId: string | null;
  createdAt: Date | null;
  isEmbeddedLaunch: boolean | null;
};
type ApplyGuardInput = { pendingCount: number; hasSurveyInProgress: boolean };
type ApplyGuardResult = { allowed: boolean; reason: string | null; warning: string | null };
type CheckResult = { outcome: 'unavailable' | 'up-to-date' | 'downloaded' | 'error' };

const otaUpdates = () => require('../lib/otaUpdates');
const getOtaStatus = (): OtaStatus => otaUpdates().getOtaStatus();
const canApplyUpdateNow = (input: ApplyGuardInput): ApplyGuardResult =>
  otaUpdates().canApplyUpdateNow(input);
const checkAndFetchUpdate = (): Promise<CheckResult> => otaUpdates().checkAndFetchUpdate();

const buildConfig = () => appConfig({ config: { name: 'test', slug: 'test' } } as never);

const packageJson = () =>
  JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
    jest: { moduleNameMapper: Record<string, string> };
  };

beforeEach(() => {
  jest.resetModules();
  // `jest.doMock` con una fábrica que lanza (usado por los casos "sin módulo
  // nativo") queda registrado para el resto del archivo — `resetModules()`
  // limpia el caché de módulos, pero no las fábricas de mock. Se reafirma
  // aquí el mock bueno para que cada test arranque desde un estado conocido.
  jest.doMock('expo-updates', () => mockUpdates, { virtual: true });
  Object.assign(mockUpdates, {
    isEnabled: true,
    channel: 'preview',
    runtimeVersion: '1.0.0',
    updateId: '3f2a1c40-0000-4000-8000-000000000001',
    createdAt: new Date('2026-08-30T14:02:00.000Z'),
    isEmbeddedLaunch: false,
  });
  mockUpdates.checkForUpdateAsync.mockReset();
  mockUpdates.fetchUpdateAsync.mockReset();
  mockUpdates.reloadAsync.mockReset();
});

describe('Criterio 1 — la librería está instalada y la configuración deja de ser inerte', () => {
  it('declara `expo-updates` como dependencia', () => {
    // El bug de origen en una línea: sin este paquete, el bloque `updates` de
    // `app.config.ts` no hace nada y no existe canal OTA, por muy bien escrita
    // que esté la configuración.
    expect(packageJson().dependencies).toHaveProperty('expo-updates');
  });

  it('mantiene el bloque `updates` apuntando al servidor de Expo, habilitado y sin bloquear el arranque', () => {
    const updates = buildConfig().updates;
    expect(updates?.enabled).toBe(true);
    expect(updates?.url).toBe('https://u.expo.dev/a9915da7-c235-4537-a1a0-de31ac73d63b');
    // `0` = nunca retener el splash esperando red. En una zona sin cobertura,
    // bloquear el arranque sería peor que aplicar el update en el siguiente.
    expect(updates?.fallbackToCacheTimeout).toBe(0);
  });

  it('declara `checkAutomatically` de forma explícita, sin depender del valor por defecto', () => {
    expect(buildConfig().updates?.checkAutomatically).toBe('ON_LOAD');
  });

  it('mantiene la política de runtime en `appVersion` con la versión que corre en las tablets', () => {
    // Decisión del 2026-08-30: se descartó `fingerprint`. La contrapartida es
    // que `version` pasa a ser un campo peligroso — subirlo corta el canal OTA
    // en silencio para todo binario ya instalado. Este caso es su guardarraíl.
    expect(buildConfig().runtimeVersion).toEqual({ policy: 'appVersion' });
    expect(buildConfig().version).toBe('1.0.0');
  });

  it('registra el mock de `expo-updates` en la configuración de jest', () => {
    expect(packageJson().jest.moduleNameMapper).toHaveProperty('^expo-updates$');
  });
});

describe('Criterio 7 — el envoltorio degrada sin romper cuando no hay módulo nativo', () => {
  it('informa el estado real del canal cuando el módulo está disponible', () => {
    const status = getOtaStatus();
    expect(status.available).toBe(true);
    expect(status.isEnabled).toBe(true);
    expect(status.channel).toBe('preview');
    expect(status.runtimeVersion).toBe('1.0.0');
    expect(status.updateId).toBe('3f2a1c40-0000-4000-8000-000000000001');
  });

  it('distingue el bundle embebido de uno recibido por OTA', () => {
    mockUpdates.isEmbeddedLaunch = true;
    mockUpdates.updateId = null as unknown as string;
    const status = getOtaStatus();
    expect(status.isEmbeddedLaunch).toBe(true);
    expect(status.updateId).toBeNull();
  });

  it('devuelve `available: false` en vez de lanzar cuando el módulo nativo no existe (Expo Go)', () => {
    jest.resetModules();
    jest.doMock('expo-updates', () => {
      throw new Error('Native module not available');
    }, { virtual: true });

    const status = getOtaStatus();
    expect(status.available).toBe(false);
    expect(status.isEnabled).toBeNull();
    expect(status.channel).toBeNull();
  });

  it('no lanza al buscar actualizaciones sin módulo nativo: devuelve `unavailable`', async () => {
    jest.resetModules();
    jest.doMock('expo-updates', () => {
      throw new Error('Native module not available');
    }, { virtual: true });

    await expect(checkAndFetchUpdate()).resolves.toEqual(
      expect.objectContaining({ outcome: 'unavailable' }),
    );
  });

  // ── Expo Go real (hallazgo de TC-080-001, 2026-08-31) ──────────────────
  //
  // Los dos casos de arriba simulan Expo Go haciendo que el `require`
  // **lance**. Esa era la suposición del diseño original — y es falsa: en
  // Expo Go el módulo se importa sin problema. Por eso ambos tests pasaban
  // mientras la pantalla, en un Expo Go de verdad, reportaba «OTA activo: sí»
  // con el `updateId` del bundle de Metro y el botón terminaba en error.
  //
  // Estos casos reproducen el comportamiento real: módulo presente, pero con
  // el `runtimeVersion` de Expo Go (`exposdk:*`) en vez del de la app.
  describe('Expo Go real: el módulo carga, pero no hay canal detrás', () => {
    const expoGoUpdates = {
      isEnabled: true,
      channel: '',
      runtimeVersion: 'exposdk:54.0.0',
      updateId: '047fdcc7-0000-4000-8000-0000000000ff',
      createdAt: new Date('2026-08-31T21:03:20.000Z'),
      isEmbeddedLaunch: false,
      checkForUpdateAsync: jest.fn(() => {
        throw new Error('checkForUpdateAsync is not supported in Expo Go');
      }),
      fetchUpdateAsync: jest.fn(),
      reloadAsync: jest.fn(),
    };

    beforeEach(() => {
      jest.resetModules();
      jest.doMock('expo-updates', () => expoGoUpdates, { virtual: true });
    });

    it('reporta `available: false` en vez de los datos del propio Expo Go', () => {
      const status = getOtaStatus();
      expect(status.available).toBe(false);
      expect(status.isEnabled).toBeNull();
      expect(status.updateId).toBeNull();
      expect(status.runtimeVersion).toBeNull();
    });

    it('devuelve `unavailable` sin llegar a llamar a la API nativa', async () => {
      await expect(checkAndFetchUpdate()).resolves.toEqual(
        expect.objectContaining({ outcome: 'unavailable' }),
      );
      // Lo que importa: no se invoca la API. Antes sí se invocaba, fallaba, y
      // su `catch` mandaba a Sentry un error que no es un problema real.
      expect(expoGoUpdates.checkForUpdateAsync).not.toHaveBeenCalled();
    });
  });
});

describe('Criterio 5 — buscar y descargar una actualización', () => {
  it('descarga cuando hay novedad', async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    mockUpdates.fetchUpdateAsync.mockResolvedValue({ isNew: true });

    const result = await checkAndFetchUpdate();

    expect(result.outcome).toBe('downloaded');
    expect(mockUpdates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
  });

  it('no descarga nada cuando el dispositivo ya está al día', async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });

    const result = await checkAndFetchUpdate();

    expect(result.outcome).toBe('up-to-date');
    expect(mockUpdates.fetchUpdateAsync).not.toHaveBeenCalled();
  });

  it('convierte un fallo de red en `error`, sin propagar la excepción', async () => {
    // "Ningún fallo silencioso" (criterio de diseño de la ronda de campo): el
    // error no puede tumbar la pantalla, pero tampoco desaparecer sin dejar
    // rastro — el envoltorio lo registra y lo devuelve como resultado.
    mockUpdates.checkForUpdateAsync.mockRejectedValue(new Error('Network request failed'));

    await expect(checkAndFetchUpdate()).resolves.toEqual(
      expect.objectContaining({ outcome: 'error' }),
    );
  });
});

describe('Criterio 6 — la recarga no atropella trabajo en curso', () => {
  it('permite reiniciar cuando no hay encuesta abierta ni cola pendiente', () => {
    const guard = canApplyUpdateNow({ pendingCount: 0, hasSurveyInProgress: false });
    expect(guard.allowed).toBe(true);
    expect(guard.warning).toBeNull();
  });

  it('bloquea el reinicio con una encuesta en curso, y dice por qué', () => {
    // Los borradores viven en SQLite y sobrevivirían, pero una recarga a mitad
    // de captura es indistinguible de un crash para quien la está sufriendo.
    const guard = canApplyUpdateNow({ pendingCount: 0, hasSurveyInProgress: true });
    expect(guard.allowed).toBe(false);
    expect(guard.reason).toEqual(expect.any(String));
    expect(guard.reason).not.toHaveLength(0);
  });

  it('advierte, pero no bloquea, cuando hay elementos en la cola de sync', () => {
    // La cola es persistente y sobrevive a la recarga: el aviso existe para
    // que quien opera prefiera esperar a que suba, no para impedírselo.
    const guard = canApplyUpdateNow({ pendingCount: 3, hasSurveyInProgress: false });
    expect(guard.allowed).toBe(true);
    expect(guard.warning).toEqual(expect.any(String));
    expect(guard.warning).not.toHaveLength(0);
  });

  it('la encuesta en curso manda sobre la cola pendiente', () => {
    const guard = canApplyUpdateNow({ pendingCount: 3, hasSurveyInProgress: true });
    expect(guard.allowed).toBe(false);
  });
});
