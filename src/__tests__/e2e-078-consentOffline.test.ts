/**
 * Spec 78 — Consentimiento informado, rama offline de la app móvil.
 *
 * Cubre los criterios de aceptación 3, 4, 8 y 9 de
 * `spec/78_consentimiento_informado_tratamiento_datos.md`. Lo visual (texto
 * completo legible, banner de sin conexión, escalado de fuente) se verifica en
 * `docs/testing/test-078-consentimiento-informado.md`, casos TC-078-010 a
 * TC-078-013.
 *
 * ARRANCA EN ROJO: `src/lib/hasValidConsent.ts`,
 * `src/storage/consentDocumentCache.ts` y `src/storage/consentRecordStore.ts`
 * todavía no existen (Fases 6 y 7), y `sync_queue` todavía no admite
 * `itemType: 'consent'`.
 *
 * Nota de entorno: los casos que dependen de transiciones de conectividad se
 * repiten en APK `preview` — Expo Go no reproduce con fidelidad la secuencia de
 * eventos de NetInfo (ver `mobile/CLAUDE.md`, nota del spec 52).
 *
 * **Cambio de alcance (2026-08-28):** el consentimiento deja de bloquear
 * `pre-survey.tsx → orchestrator`; se abre desde un `ConsentModal` superpuesto
 * al orquestador (Fases 14-15), controlado por `store.consentPending`. Los
 * tests de este archivo (`hasValidConsent`, `buildConsentSyncPayload`,
 * `remapConsentSessionId`, `orderConsentBeforeSurveys`) prueban lógica pura
 * que **no dependía de cuándo se dispara la pantalla** — ninguno requiere
 * reescritura. `orderConsentBeforeSurveys` en particular ya no puede asumir
 * que la entrada `'consent'' sea la primera de la cola de esa sesión (ahora
 * puede encolarse a mitad de sesión), pero eso es justo lo que ya prueba: que
 * se reordena, no que ya venía ordenada. Los tests de `ConsentModal` y del
 * hook `useSubmitConsent` (Fase 14, nuevos) quedan pendientes de escribirse
 * cuando esos módulos existan — no se fabrican aquí contra código que aún no
 * se diseñó a nivel de implementación.
 */

import { hasValidConsent } from '../lib/hasValidConsent';
import {
  buildConsentSyncPayload,
  orderConsentBeforeSurveys,
  remapConsentSessionId,
} from '../sync/consentSync';

const ACTIVE_VERSION = '1.1';
const LOCAL_SESSION_ID = 'local_9f3c1a80-0000-4000-8000-000000000001';
const REAL_SESSION_ID = '33333333-3333-4333-8333-333333333333';

describe('hasValidConsent — vigencia evaluada sin red (spec 78)', () => {
  // Criterio 4, rama offline
  it('es válido cuando el agricultor cacheado aceptó la versión activa', () => {
    expect(
      hasValidConsent(
        { consentVersion: ACTIVE_VERSION, consentedAt: new Date('2026-08-20T10:00:00Z') },
        ACTIVE_VERSION,
      ),
    ).toBe(true);
  });

  // Criterio 5, rama offline
  it('deja de ser válido cuando la versión activa cacheada es posterior', () => {
    expect(
      hasValidConsent(
        { consentVersion: '1.0', consentedAt: new Date('2026-08-01T10:00:00Z') },
        ACTIVE_VERSION,
      ),
    ).toBe(false);
  });

  it('no es válido si el agricultor cacheado no tiene consentimiento registrado', () => {
    expect(hasValidConsent({}, ACTIVE_VERSION)).toBe(false);
  });

  it('ante versión activa desconocida exige el consentimiento en vez de asumirlo', () => {
    expect(
      hasValidConsent({ consentVersion: ACTIVE_VERSION, consentedAt: new Date() }, null),
    ).toBe(false);
  });
});

describe('buildConsentSyncPayload — lo que viaja en la cola', () => {
  // Criterio 3
  it('conserva las tres autorizaciones multimedia por separado', () => {
    const payload = buildConsentSyncPayload({
      localId: 'consent_1',
      sessionId: LOCAL_SESSION_ID,
      consentDocumentId: '44444444-4444-4444-8444-444444444444',
      respondentName: 'Nombre de prueba',
      acceptedDataProcessing: true,
      acceptedPhoto: true,
      acceptedAudio: false,
      acceptedVideo: false,
      acceptedFollowUpContact: false,
      acceptedAt: new Date('2026-08-20T09:15:00.000Z'),
    });

    expect(payload).toMatchObject({
      acceptedPhoto: true,
      acceptedAudio: false,
      acceptedVideo: false,
    });
  });

  // Criterio 8 — la fecha que vale es la del momento en que se aceptó offline
  it('envía la fecha de aceptación original, no la del momento de sincronizar', () => {
    const acceptedAt = new Date('2026-08-20T09:15:00.000Z');
    const payload = buildConsentSyncPayload({
      localId: 'consent_1',
      sessionId: LOCAL_SESSION_ID,
      consentDocumentId: '44444444-4444-4444-8444-444444444444',
      respondentName: 'Nombre de prueba',
      acceptedDataProcessing: true,
      acceptedPhoto: false,
      acceptedAudio: false,
      acceptedVideo: false,
      acceptedFollowUpContact: false,
      acceptedAt,
    });

    expect(payload.acceptedAt).toBe(acceptedAt.toISOString());
  });
});

describe('remapConsentSessionId — el backend nunca ve un sessionId provisional', () => {
  // Criterio 8
  it('reemplaza el sessionId local por el real antes de enviar', () => {
    const remapped = remapConsentSessionId(
      { localId: 'consent_1', sessionId: LOCAL_SESSION_ID },
      { [LOCAL_SESSION_ID]: REAL_SESSION_ID },
    );

    expect(remapped.sessionId).toBe(REAL_SESSION_ID);
    expect(remapped.sessionId.startsWith('local_')).toBe(false);
  });

  it('no envía la entrada si el sessionId provisional todavía no tiene equivalente real', () => {
    expect(() =>
      remapConsentSessionId({ localId: 'consent_1', sessionId: LOCAL_SESSION_ID }, {}),
    ).toThrow();
  });
});

describe('orderConsentBeforeSurveys — orden de la cola', () => {
  // Criterio 8: la constancia de una sesión se envía antes que sus respuestas
  it('coloca la entrada de consentimiento antes que las encuestas de la misma sesión', () => {
    const queue = [
      { id: 'q2', itemType: 'survey' as const, campaignSessionId: LOCAL_SESSION_ID },
      { id: 'q1', itemType: 'consent' as const, campaignSessionId: LOCAL_SESSION_ID },
      { id: 'q3', itemType: 'survey' as const, campaignSessionId: LOCAL_SESSION_ID },
    ];

    expect(orderConsentBeforeSurveys(queue).map((e) => e.id)).toEqual(['q1', 'q2', 'q3']);
  });

  // Criterio 9 y decisión de diseño: una constancia que falló con 4xx no debe
  // bloquear la subida de las respuestas ya recolectadas.
  it('no bloquea las encuestas cuando la constancia quedó en failed_validation', () => {
    const queue = [
      {
        id: 'q1',
        itemType: 'consent' as const,
        campaignSessionId: LOCAL_SESSION_ID,
        status: 'failed_validation' as const,
      },
      { id: 'q2', itemType: 'survey' as const, campaignSessionId: LOCAL_SESSION_ID },
    ];

    const ordered = orderConsentBeforeSurveys(queue);

    expect(ordered.map((e) => e.id)).toContain('q2');
    expect(ordered.find((e) => e.id === 'q2')?.blocked).toBeFalsy();
  });

  // Hallazgo M3 (auditoría) — el comparador debe ser una relación de orden
  // total y transitiva: con más de una sesión en la cola, no debe reordenar
  // entre sesiones distintas (cada una conserva su orden de primera
  // aparición), solo dentro de cada una.
  it('con varias sesiones en la cola, no reordena entre sesiones distintas', () => {
    const OTHER_SESSION_ID = 'local_session_other';
    const queue = [
      { id: 'a-survey', itemType: 'survey' as const, campaignSessionId: LOCAL_SESSION_ID },
      { id: 'b-consent', itemType: 'consent' as const, campaignSessionId: OTHER_SESSION_ID },
      { id: 'a-consent', itemType: 'consent' as const, campaignSessionId: LOCAL_SESSION_ID },
      { id: 'b-survey', itemType: 'survey' as const, campaignSessionId: OTHER_SESSION_ID },
    ];

    const ordered = orderConsentBeforeSurveys(queue).map((e) => e.id);

    // La sesión LOCAL_SESSION_ID apareció primero en la cola original → su
    // grupo va primero; dentro de cada grupo, consent antes que survey.
    expect(ordered).toEqual(['a-consent', 'a-survey', 'b-consent', 'b-survey']);
  });
});
