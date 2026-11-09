import { consentRecordStore, type ConsentRecordDraft } from '../storage/consentRecordStore';
import { surveyDraftStore } from '../storage/surveyDraftStore';
import { syncQueueStorage } from '../storage/syncQueue';
import { enqueueConsent } from './saveAnchoredConsent';

// Spec 103 (auditoría 80, M2) — la constancia del alta de un productor nuevo se
// guarda al aceptar (anclada al S_REG) y se encola al cerrar el registro
// («Ver productor»). Si el registro no se cierra en la app (se cierra en
// «Encuesta completada», o el S_REG se descarta desde Borradores), la
// constancia queda `pending` sin entrada en la cola y nunca se envía.
// Este barrido, que corre al inicio de cada sincronización, la recupera:
//   - S_REG terminado (completed o synced) → se encola; la cola la difiere
//     hasta que el S_REG exista en el backend (DM9);
//   - S_REG todavía en borrador → se espera (el registro sigue en curso);
//   - S_REG ya no existe (descartado) → la constancia se marca `failed`: no
//     hay a quién anclarla y no debe enviarse.

export type SurveyLocalStatus = 'draft' | 'completed' | 'synced' | null;

export interface RegistrationConsentSweepDeps {
  listPending(): Promise<ConsentRecordDraft[]>;
  hasActiveQueueEntry(localConsentId: string): Promise<boolean>;
  surveyStatusOf(localSurveyId: string): Promise<SurveyLocalStatus>;
  enqueue(localConsentId: string): Promise<void>;
  markFailed(localConsentId: string): Promise<void>;
}

export interface RegistrationConsentSweepResult {
  enqueued: string[];
  discarded: string[];
}

const defaultDeps: RegistrationConsentSweepDeps = {
  listPending: () => consentRecordStore.listPendingSurveyAnchored(),
  hasActiveQueueEntry: async (id) => (await syncQueueStorage.getActiveBySurveyId(id)) !== null,
  surveyStatusOf: (surveyId) => surveyDraftStore.getStatus(surveyId),
  enqueue: (id) => enqueueConsent(id),
  markFailed: (id) => consentRecordStore.markFailed(id),
};

export async function sweepRegistrationConsents(
  deps: RegistrationConsentSweepDeps = defaultDeps,
): Promise<RegistrationConsentSweepResult> {
  const result: RegistrationConsentSweepResult = { enqueued: [], discarded: [] };
  const pending = await deps.listPending();
  for (const record of pending) {
    if (!record.surveyId) continue;
    if (await deps.hasActiveQueueEntry(record.id)) continue;
    const status = await deps.surveyStatusOf(record.surveyId);
    if (status === 'draft') continue;
    if (status === null) {
      await deps.markFailed(record.id);
      result.discarded.push(record.id);
      continue;
    }
    await deps.enqueue(record.id);
    result.enqueued.push(record.id);
  }
  return result;
}
