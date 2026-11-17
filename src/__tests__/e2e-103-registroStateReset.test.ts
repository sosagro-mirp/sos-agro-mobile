/**
 * Spec 103 — auditoría 79: el estado `registro` (alta de productor nuevo) no
 * debe sobrevivir a un registro abandonado ni contaminar encuestas siguientes.
 */
jest.mock('../storage/surveyDraftStore', () => ({ surveyDraftStore: {} }));
jest.mock('../storage/syncQueue', () => ({ syncQueueStorage: {} }));
jest.mock('../sync/SyncQueueService', () => ({ SyncQueueService: {} }));
jest.mock('../store/useSyncStatusStore', () => ({ useSyncStatusStore: { getState: jest.fn() } }));

import { useInstrumentSurveyStore } from '../store/useInstrumentSurveyStore';

const init = (extra: Record<string, unknown> = {}) =>
  useInstrumentSurveyStore.getState().initializeSurvey({
    surveyId: 'local_survey_x',
    instrumentId: 'i1',
    instrumentName: 'I',
    sections: [],
    ...extra,
  });

describe('useInstrumentSurveyStore — registro', () => {
  beforeEach(() => useInstrumentSurveyStore.getState().reset());

  it('un registro abandonado no se hereda en la encuesta siguiente', () => {
    init();
    useInstrumentSurveyStore.setState({ registro: { consent: null } });
    expect(useInstrumentSurveyStore.getState().registro).not.toBeNull();

    init({ campaignSessionId: 'sess-1' }); // inicio de otra encuesta (campaña)
    expect(useInstrumentSurveyStore.getState().registro).toBeNull();
  });

  it('el modo registro se fija después de inicializar y sobrevive hasta reset()', () => {
    init();
    useInstrumentSurveyStore.setState({ registro: { consent: null } });
    expect(useInstrumentSurveyStore.getState().registro).not.toBeNull();
    useInstrumentSurveyStore.getState().reset();
    expect(useInstrumentSurveyStore.getState().registro).toBeNull();
  });
});
