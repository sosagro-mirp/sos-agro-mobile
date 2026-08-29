/**
 * Spec 76 — Endurecimiento del arranque, el tema y el diagnóstico en `mobile/`.
 *
 * Cubre los criterios automatizables de
 * `spec/76_endurecimiento_arranque_tema_y_diagnostico_mobile.md`: 2, 3, 6, 7, 8, 9 y 10.
 * Los criterios 1, 4 y 5 solo se verifican en dispositivo real y viven en
 * `docs/testing/test-076-arranque-tema-diagnostico.md`.
 *
 * ARRANCA EN ROJO, salvo el último bloque:
 *  - `app.config.ts` todavía declara `userInterfaceStyle: 'light'` y no configura splash (Fases 1-2).
 *  - `src/lib/splashGate.ts` todavía no existe (Fase 3).
 *  - `logger` todavía no expone `flush()` y reescribe el archivo entero en cada línea (Fase 4).
 *  - El último bloque ("regresión del incidente 2026-08-18") es un guardarraíl y debe estar en
 *    VERDE desde ya: protege la corrección que ya está en `main`.
 *
 * Contexto: el bucle infinito de remontaje del `ThemeProvider` (Sentry REACT-NATIVE-3/4/5/6/7/8,
 * 17 crashes fatales en 7 de 10 tablets el 2026-08-18) nació de un `return null` mientras se
 * restauraba la preferencia de tema. Estos casos fijan el contrato de la ruta de arranque que ese
 * incidente dejó a la vista.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import appConfig from '../../app.config';
import { resolveEffectiveTheme } from '../theme/resolveTheme';

// `src/lib/splashGate.ts` se crea en la Fase 3. Se resuelve de forma perezosa
// para que la ausencia del módulo haga fallar solo a sus propios casos y no
// tumbe la suite entera.
type SplashGateInput = { ready: boolean; restored: boolean; elapsedMs: number };
const shouldHideSplash = (input: SplashGateInput): boolean =>
  require('../lib/splashGate').shouldHideSplash(input);

const buildConfig = () => appConfig({ config: { name: 'test', slug: 'test' } } as never);

describe('Criterios 2 y 3 — la preferencia "sistema" sigue el tema del dispositivo', () => {
  it('resuelve a oscuro cuando el dispositivo está en oscuro', () => {
    expect(resolveEffectiveTheme('system', 'dark')).toBe('dark');
  });

  it('resuelve a claro cuando el dispositivo está en claro', () => {
    expect(resolveEffectiveTheme('system', 'light')).toBe('light');
  });

  it('la configuración nativa NO fuerza el estilo de interfaz a claro', () => {
    // `userInterfaceStyle: 'light'` contradice a una app con tema oscuro. Hoy
    // no tiene efecto en Android —requiere `expo-system-ui`, que no está
    // instalado— pero sí lo tendría en iOS, y empezaría a aplicarse solo el
    // día que ese paquete entre como transitiva de cualquier módulo de Expo.
    // Este caso es el guardarraíl de esa bomba de relojería.
    expect(buildConfig().userInterfaceStyle).toBe('automatic');
  });
});

describe('Criterio 5 (configuración) — el splash está declarado', () => {
  it('declara el plugin de expo-splash-screen con el icono de la app', () => {
    const plugins = buildConfig().plugins ?? [];
    const splash = plugins.find(
      (p) => Array.isArray(p) && p[0] === 'expo-splash-screen',
    ) as [string, Record<string, unknown>] | undefined;

    expect(splash).toBeDefined();
    expect(splash![1].image).toBe('./assets/splash-icon.png');
  });

  it('define color de fondo para tema claro y para tema oscuro', () => {
    const plugins = buildConfig().plugins ?? [];
    const splash = plugins.find(
      (p) => Array.isArray(p) && p[0] === 'expo-splash-screen',
    ) as [string, Record<string, unknown>] | undefined;

    expect(splash![1].backgroundColor).toBeDefined();
    expect((splash![1].dark as Record<string, unknown>)?.backgroundColor).toBeDefined();
  });
});

describe('Criterios 6 y 7 — el splash no puede colgar la app', () => {
  const TOPE_MS = 10_000;

  it('oculta el splash cuando todo está listo', () => {
    expect(shouldHideSplash({ ready: true, restored: true, elapsedMs: 500 })).toBe(true);
  });

  it('mantiene el splash mientras falta alguna dependencia y no se agotó el tope', () => {
    expect(shouldHideSplash({ ready: false, restored: true, elapsedMs: 500 })).toBe(false);
    expect(shouldHideSplash({ ready: true, restored: false, elapsedMs: 500 })).toBe(false);
  });

  it('oculta el splash al superar el tope aunque la inicialización nunca termine', () => {
    // Es el escenario del criterio 6: `runMigrations()` rechaza, `dbReady` se
    // queda en false para siempre y hoy el splash no se oculta nunca.
    expect(shouldHideSplash({ ready: false, restored: false, elapsedMs: TOPE_MS + 1 })).toBe(true);
  });

  it('el tope no supera los 10 segundos', () => {
    expect(shouldHideSplash({ ready: false, restored: false, elapsedMs: TOPE_MS })).toBe(true);
  });
});

describe('Criterios 8 y 9 — el logger no pierde líneas ni relee el archivo completo', () => {
  const files = new Map<string, string>();
  let readCalls = 0;

  beforeEach(() => {
    files.clear();
    readCalls = 0;
    jest.resetModules();

    jest.doMock('expo-file-system/legacy', () => ({
      documentDirectory: '/doc/',
      EncodingType: { UTF8: 'utf8' },
      getInfoAsync: jest.fn(async (path: string) => ({
        exists: path.endsWith('/') ? true : files.has(path),
        size: files.get(path)?.length ?? 0,
      })),
      makeDirectoryAsync: jest.fn(async () => undefined),
      readDirectoryAsync: jest.fn(async () => [...files.keys()].map((p) => p.split('/').pop()!)),
      deleteAsync: jest.fn(async () => undefined),
      readAsStringAsync: jest.fn(async (path: string) => {
        readCalls += 1;
        return files.get(path) ?? '';
      }),
      writeAsStringAsync: jest.fn(async (path: string, content: string) => {
        files.set(path, content);
      }),
    }));
  });

  it('dos escrituras concurrentes producen dos líneas — ninguna se pierde', async () => {
    const { logger } = require('../lib/logger');

    logger.info('primera');
    logger.info('segunda');
    await logger.flush();

    const content = [...files.values()].join('');
    expect(content).toContain('primera');
    expect(content).toContain('segunda');
  });

  it('veinte escrituras concurrentes producen veinte líneas', async () => {
    const { logger } = require('../lib/logger');

    for (let i = 0; i < 20; i += 1) logger.info(`linea-${i}`);
    await logger.flush();

    const lines = [...files.values()].join('').trim().split('\n');
    expect(lines).toHaveLength(20);
  });

  it('escribir una línea no relee el archivo completo', async () => {
    const { logger } = require('../lib/logger');

    for (let i = 0; i < 10; i += 1) logger.info(`linea-${i}`);
    await logger.flush();

    // Hoy `appendToFile()` hace read-modify-write: una lectura íntegra por
    // línea. Con un log de 5 MB, escribir una línea mueve 10 MB de I/O.
    expect(readCalls).toBe(0);
  });

  it('un reinicio del proceso no pisa el segmento que dejó la ejecución anterior', async () => {
    // Regresión encontrada en la auditoría del spec 76
    // (`docs/reports/auditorias/35-...`): `segmentDate`/`segmentIndex` viven
    // en memoria del módulo, así que al reiniciar el proceso (`jest.resetModules`
    // simula exactamente eso: un `require` nuevo del módulo, como ocurre en
    // cada arranque de la app) el primer `write()` del día volvía a arrancar
    // en el índice `000` y `writeAsStringAsync` pisaba lo que ya hubiera ahí.
    // Si la ejecución anterior había crasheado, el reinicio borraba justo el
    // log de la corrida que crasheó — la evidencia que necesita `TC-076-01`.
    const { logger: firstRun } = require('../lib/logger');
    firstRun.info('antes-del-crash');
    await firstRun.flush();

    const filesAfterFirstRun = new Map(files); // `beforeEach` no limpia `files` a mitad de un `it`.
    expect(filesAfterFirstRun.size).toBe(1);

    // Simula el reinicio: nuevo `require`, mismo directorio de logs en disco.
    jest.resetModules();
    const { logger: secondRun } = require('../lib/logger');
    secondRun.info('despues-del-reinicio');
    await secondRun.flush();

    // El segmento de la primera ejecución sigue intacto, y la segunda
    // escribió en un segmento nuevo — nunca se pisaron entre sí.
    for (const [path, content] of filesAfterFirstRun) {
      expect(files.get(path)).toBe(content);
    }
    expect(files.size).toBe(2);
    expect([...files.values()].join('')).toContain('antes-del-crash');
    expect([...files.values()].join('')).toContain('despues-del-reinicio');
  });

  it('la rotación por tamaño reparte las líneas en varios segmentos del mismo día', async () => {
    const { logger } = require('../lib/logger');

    // MAX_SEGMENT_BYTES = 256 KB; una línea de ~50 KB fuerza rotación cada
    // pocas escrituras dentro de la misma pasada de `flushBuffer()`.
    const bigLine = 'x'.repeat(50 * 1024);
    for (let i = 0; i < 10; i += 1) logger.info(`${i}-${bigLine}`);
    await logger.flush();

    expect(files.size).toBeGreaterThan(1);
  });

  it('getLogs() reagrupa varios segmentos del mismo día en una sola entrada', async () => {
    const { logger } = require('../lib/logger');

    const bigLine = 'x'.repeat(50 * 1024);
    for (let i = 0; i < 10; i += 1) logger.info(`${i}-${bigLine}`);
    await logger.flush();

    const logs = await logger.getLogs();
    const today = new Date().toISOString().slice(0, 10);

    expect(logs).toHaveLength(1);
    expect(logs[0].date).toBe(today);
    for (let i = 0; i < 10; i += 1) expect(logs[0].content).toContain(`${i}-`);
  });
});

describe('Regresión del incidente 2026-08-18 — ningún provider desmonta el árbol', () => {
  // Guardarraíl del criterio 10. Debe estar en VERDE desde ya: protege la
  // corrección del bucle de remontaje que ya vive en `main`. Un `return null`
  // en un componente que envuelve `children` es lo que produjo los 17 crashes
  // fatales en las tablets.
  const wrappers = [
    'src/theme/ThemeProvider.tsx',
    'src/components/common/Snackbar.tsx',
    'app/_layout.tsx',
  ];

  // Nombres de los componentes que efectivamente envuelven `children` en cada
  // archivo. `app/_layout.tsx` no define ningún `*Provider` propio —el que
  // envuelve el árbol es `RootLayout`—, así que el patrón original
  // (`\w*Provider`) pasaba en verde sin revisar una sola línea de ese archivo
  // (hallazgo de la auditoría del spec 76, `docs/reports/auditorias/35-...`).
  const wrapperNames: Record<string, RegExp> = {
    'src/theme/ThemeProvider.tsx': /Provider$/,
    'src/components/common/Snackbar.tsx': /Provider$/,
    'app/_layout.tsx': /^RootLayout$/,
  };

  it.each(wrappers)('%s nunca devuelve null en lugar de sus children', (relativePath) => {
    const source = readFileSync(join(__dirname, '../..', relativePath), 'utf8');

    // Se recortan las líneas de comentario: el propio ThemeProvider documenta
    // el incidente citando el `return null` que ya no existe.
    const code = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');

    const namePattern = wrapperNames[relativePath];
    const declarations = code.match(/(?:export default )?function\s+(\w+)[\s\S]*?\n}/g) ?? [];
    const wrapperBodies = declarations.filter((decl) => {
      const nameMatch = decl.match(/function\s+(\w+)/);
      return nameMatch !== null && namePattern.test(nameMatch[1]);
    });

    // Guardarraíl del guardarraíl: si esto llega a 0, el `for` de abajo no
    // verificaría nada y el caso pasaría en verde sin haber comprobado nada
    // — exactamente el falso positivo que tenía este test para `_layout.tsx`.
    expect(wrapperBodies.length).toBeGreaterThan(0);

    for (const body of wrapperBodies) {
      expect(body).not.toMatch(/return\s+null\s*;/);
    }
  });
});
