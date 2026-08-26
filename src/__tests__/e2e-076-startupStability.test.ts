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

  it.each(wrappers)('%s nunca devuelve null en lugar de sus children', (relativePath) => {
    const source = readFileSync(join(__dirname, '../..', relativePath), 'utf8');

    // Se recortan las líneas de comentario: el propio ThemeProvider documenta
    // el incidente citando el `return null` que ya no existe.
    const code = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');

    const wrapperBodies = code.match(/function\s+\w*Provider[\s\S]*?\n}/g) ?? [];
    for (const body of wrapperBodies) {
      expect(body).not.toMatch(/return\s+null\s*;/);
    }
  });
});
