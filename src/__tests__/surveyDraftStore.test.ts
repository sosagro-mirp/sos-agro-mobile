/**
 * Unit tests for surveyDraftStore.
 *
 * The Drizzle `db` module is mocked with a simple in-memory store that
 * simulates the subset of the Drizzle query builder API used by surveyDraftStore.
 */

import type { InstrumentDraftAnswer } from '../types';

// surveyDraftStore builds its `where` conditions with real drizzle-orm
// combinators (eq/and/lt), which produce SQL AST nodes meant for a real
// driver. The in-memory mock below needs plain JS predicates instead, so we
// replace just those three combinators with predicate-returning versions
// that resolve each drizzle column back to the JS row key it maps to.
jest.mock('drizzle-orm', () => {
  const actual = jest.requireActual('drizzle-orm');
  const { surveys, responses } = jest.requireActual('../storage/db/schema');

  const columnToKey = new Map<unknown, string>();
  for (const table of [surveys, responses]) {
    for (const [key, column] of Object.entries(table as Record<string, unknown>)) {
      columnToKey.set(column, key);
    }
  }
  const keyFor = (column: unknown): string => {
    const key = columnToKey.get(column);
    if (!key) throw new Error('Unknown column in drizzle-orm mock');
    return key;
  };

  return {
    ...actual,
    eq:
      (column: unknown, value: unknown) =>
      (row: Record<string, unknown>) =>
        row[keyFor(column)] === value,
    lt:
      (column: unknown, value: unknown) =>
      (row: Record<string, unknown>) =>
        (row[keyFor(column)] as number | Date) < (value as number | Date),
    and:
      (...conds: Array<(row: Record<string, unknown>) => boolean>) =>
      (row: Record<string, unknown>) =>
        conds.every((cond) => cond(row)),
  };
});

import { responses as responsesTable } from '../storage/db/schema';

// ─── In-memory DB mock ────────────────────────────────────────────────────────

interface SurveyRow {
  id: string;
  instrumentId: string;
  campaignSessionId: string | null;
  status: 'draft' | 'completed' | 'synced';
  createdAt: Date;
  updatedAt: Date;
}

interface ResponseRow {
  id: string;
  surveyId: string;
  questionId: string;
  optionId: string | null;
  optionIds: string | null;
  textValue: string | null;
  numericValue: number | null;
  booleanValue: boolean | null;
  otherText: string | null;
}

let surveyStore: SurveyRow[] = [];
let responseStore: ResponseRow[] = [];

// Minimal query builder mock compatible with the surveyDraftStore usage.
const createMockDb = () => {
  const mockDb = {
    // insert(table).values(row) — returns { onConflictDoUpdate }
    insert: jest.fn().mockImplementation((_table: unknown) => ({
      values: jest.fn().mockImplementation((row: SurveyRow | ResponseRow) => {
        if ('instrumentId' in row) {
          surveyStore.push(row as SurveyRow);
        } else {
          // Overwrite if exists (upsert behaviour matched below)
          const idx = responseStore.findIndex((r) => r.id === (row as ResponseRow).id);
          if (idx >= 0) responseStore[idx] = row as ResponseRow;
          else responseStore.push(row as ResponseRow);
        }
        return {
          onConflictDoUpdate: jest.fn().mockImplementation(({ set }: { set: Partial<ResponseRow> }) => {
            const idx = responseStore.findIndex((r) => r.id === (row as ResponseRow).id);
            if (idx >= 0) responseStore[idx] = { ...responseStore[idx], ...set };
            return Promise.resolve();
          }),
        };
      }),
    })),

    // select().from(table).where(condition).get() | .all()
    select: jest.fn().mockImplementation(() => mockDb._selectChain()),

    _selectChain: () => {
      let _table: 'surveys' | 'responses' = 'surveys';
      let _condition: ((row: SurveyRow | ResponseRow) => boolean) | null = null;

      const chain = {
        from: jest.fn().mockImplementation((table: unknown) => {
          // Drizzle table objects don't stringify to their name, so match
          // by reference against the real (unmocked) schema exports.
          _table = table === responsesTable ? 'responses' : 'surveys';
          return chain;
        }),
        where: jest.fn().mockImplementation((cond: (row: SurveyRow | ResponseRow) => boolean) => {
          _condition = cond;
          return chain;
        }),
        get: jest.fn().mockImplementation(() => {
          const store = (_table === 'surveys' ? surveyStore : responseStore) as Array<SurveyRow | ResponseRow>;
          const result = _condition ? store.find(_condition as (r: SurveyRow | ResponseRow) => boolean) : store[0];
          return Promise.resolve(result ?? null);
        }),
        all: jest.fn().mockImplementation(() => {
          const store = (_table === 'surveys' ? surveyStore : responseStore) as Array<SurveyRow | ResponseRow>;
          const result = _condition ? store.filter(_condition as (r: SurveyRow | ResponseRow) => boolean) : store;
          return Promise.resolve(result);
        }),
        limit: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
      };
      return chain;
    },

    // update(table).set(values).where(condition)
    update: jest.fn().mockImplementation((_table: unknown) => ({
      set: jest.fn().mockImplementation((values: Partial<SurveyRow>) => ({
        where: jest.fn().mockImplementation((cond: (row: SurveyRow) => boolean) => {
          surveyStore = surveyStore.map((r) => (cond(r) ? { ...r, ...values } : r));
          return Promise.resolve();
        }),
      })),
    })),

    // delete(table).where(condition)
    delete: jest.fn().mockImplementation((_table: unknown) => ({
      where: jest.fn().mockImplementation((cond: (row: SurveyRow) => boolean) => {
        surveyStore = surveyStore.filter((r) => !cond(r));
        return Promise.resolve();
      }),
    })),

    // transaction(fn) — runs fn synchronously with the same db
    transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      await fn(mockDb);
    }),
  };

  return mockDb;
};

let mockDb = createMockDb();

jest.mock('../storage/db/db', () => ({
  get db() {
    return mockDb;
  },
}));

// Import SUT after mock
import { surveyDraftStore } from '../storage/surveyDraftStore';

// ─── Test helpers ─────────────────────────────────────────────────────────────

beforeEach(() => {
  surveyStore = [];
  responseStore = [];
  mockDb = createMockDb();
});

// ─── createDraft ──────────────────────────────────────────────────────────────

describe('createDraft', () => {
  it('inserts a survey row with status="draft"', async () => {
    await surveyDraftStore.createDraft({
      surveyId: 'sv-1',
      instrumentId: 'inst-1',
    });

    expect(surveyStore).toHaveLength(1);
    expect(surveyStore[0]).toMatchObject({
      id: 'sv-1',
      instrumentId: 'inst-1',
      status: 'draft',
    });
  });

  it('stores campaignSessionId when provided', async () => {
    await surveyDraftStore.createDraft({
      surveyId: 'sv-2',
      instrumentId: 'inst-2',
      campaignSessionId: 'sess-42',
    });

    expect(surveyStore[0].campaignSessionId).toBe('sess-42');
  });

  it('stores null for campaignSessionId when not provided', async () => {
    await surveyDraftStore.createDraft({ surveyId: 'sv-3', instrumentId: 'inst-3' });
    expect(surveyStore[0].campaignSessionId).toBeNull();
  });
});

// ─── saveAnswer ───────────────────────────────────────────────────────────────

describe('saveAnswer', () => {
  beforeEach(async () => {
    await surveyDraftStore.createDraft({ surveyId: 'sv-1', instrumentId: 'inst-1' });
  });

  it('inserts a response row with id = surveyId:questionId', async () => {
    const answer: InstrumentDraftAnswer = { questionId: 'q1', textValue: 'hello' };
    await surveyDraftStore.saveAnswer('sv-1', 'q1', answer);

    expect(responseStore).toHaveLength(1);
    expect(responseStore[0].id).toBe('sv-1:q1');
    expect(responseStore[0].textValue).toBe('hello');
  });

  it('serialises optionIds as JSON string', async () => {
    const answer: InstrumentDraftAnswer = { questionId: 'q1', optionIds: ['a', 'b'] };
    await surveyDraftStore.saveAnswer('sv-1', 'q1', answer);

    expect(responseStore[0].optionIds).toBe('["a","b"]');
  });

  it('stores null for undefined fields', async () => {
    const answer: InstrumentDraftAnswer = { questionId: 'q1', numericValue: 7 };
    await surveyDraftStore.saveAnswer('sv-1', 'q1', answer);

    expect(responseStore[0].textValue).toBeNull();
    expect(responseStore[0].optionId).toBeNull();
    expect(responseStore[0].booleanValue).toBeNull();
  });
});

// ─── loadDraft ────────────────────────────────────────────────────────────────

describe('loadDraft', () => {
  it('returns null when survey does not exist', async () => {
    const result = await surveyDraftStore.loadDraft('nonexistent');
    expect(result).toBeNull();
  });

  it('reconstructs answers keyed by questionId', async () => {
    surveyStore.push({
      id: 'sv-1',
      instrumentId: 'inst-1',
      campaignSessionId: null,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    responseStore.push(
      {
        id: 'sv-1:q1',
        surveyId: 'sv-1',
        questionId: 'q1',
        textValue: 'hello',
        optionId: null,
        optionIds: null,
        numericValue: null,
        booleanValue: null,
        otherText: null,
      },
      {
        id: 'sv-1:q2',
        surveyId: 'sv-1',
        questionId: 'q2',
        textValue: null,
        optionId: null,
        optionIds: '["x","y"]',
        numericValue: null,
        booleanValue: null,
        otherText: null,
      },
    );

    const draft = await surveyDraftStore.loadDraft('sv-1');

    expect(draft).not.toBeNull();
    expect(draft!.surveyId).toBe('sv-1');
    expect(draft!.instrumentId).toBe('inst-1');
    expect(draft!.answers['q1']).toMatchObject({ questionId: 'q1', textValue: 'hello' });
    expect(draft!.answers['q2'].optionIds).toEqual(['x', 'y']);
  });

  it('parses optionIds JSON string back to array', async () => {
    surveyStore.push({
      id: 'sv-mc',
      instrumentId: 'inst-1',
      campaignSessionId: null,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    responseStore.push({
      id: 'sv-mc:q1',
      surveyId: 'sv-mc',
      questionId: 'q1',
      textValue: null,
      optionId: null,
      optionIds: '["opt-a","opt-b","opt-c"]',
      numericValue: null,
      booleanValue: null,
      otherText: null,
    });

    const draft = await surveyDraftStore.loadDraft('sv-mc');
    expect(draft!.answers['q1'].optionIds).toEqual(['opt-a', 'opt-b', 'opt-c']);
  });
});

// ─── markCompleted ────────────────────────────────────────────────────────────

describe('markCompleted', () => {
  it('updates status to "completed"', async () => {
    surveyStore.push({
      id: 'sv-1',
      instrumentId: 'inst-1',
      campaignSessionId: null,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await surveyDraftStore.markCompleted('sv-1');

    expect(surveyStore[0].status).toBe('completed');
  });
});

// ─── markSynced ───────────────────────────────────────────────────────────────

describe('markSynced', () => {
  it('updates status to "synced"', async () => {
    surveyStore.push({
      id: 'sv-1',
      instrumentId: 'inst-1',
      campaignSessionId: null,
      status: 'completed',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await surveyDraftStore.markSynced('sv-1');

    expect(surveyStore[0].status).toBe('synced');
  });
});

// ─── listDrafts ───────────────────────────────────────────────────────────────

describe('listDrafts', () => {
  it('returns only surveys with status="draft"', async () => {
    surveyStore.push(
      {
        id: 'sv-draft',
        instrumentId: 'inst-1',
        campaignSessionId: null,
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'sv-synced',
        instrumentId: 'inst-1',
        campaignSessionId: null,
        status: 'synced',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    const drafts = await surveyDraftStore.listDrafts();

    expect(drafts).toHaveLength(1);
    expect(drafts[0].surveyId).toBe('sv-draft');
  });

  it('returns empty array when no drafts exist', async () => {
    const drafts = await surveyDraftStore.listDrafts();
    expect(drafts).toEqual([]);
  });
});

// ─── listFinished (spec 92, Fase 3b) ──────────────────────────────────────────

describe('listFinished', () => {
  const schema = jest.requireActual('../storage/db/schema');

  interface Canned {
    surveys?: Array<Record<string, unknown>>;
    responses?: Array<Record<string, unknown>>;
    pendingSessions?: Array<Record<string, unknown>>;
    instrumentCache?: Array<Record<string, unknown>>;
    syncQueue?: Array<Record<string, unknown>>;
    farmerCache?: Array<Record<string, unknown>>;
  }

  // Cada tabla responde con sus filas fijas; las condiciones `where` se
  // ignoran (el filtro por dueño y el ensamblado se prueban en JS).
  const cannedDb = (canned: Canned) => {
    const reads: string[] = [];
    const tables = new Map<unknown, keyof Canned>([
      [schema.surveys, 'surveys'],
      [schema.responses, 'responses'],
      [schema.pendingSessions, 'pendingSessions'],
      [schema.instrumentCache, 'instrumentCache'],
      [schema.syncQueue, 'syncQueue'],
      [schema.farmerCache, 'farmerCache'],
    ]);
    mockDb.select.mockImplementation(() => {
      let name: keyof Canned = 'surveys';
      const chain = {
        from: (table: unknown) => {
          name = tables.get(table) as keyof Canned;
          reads.push(name);
          return chain;
        },
        where: () => chain,
        all: () => Promise.resolve(canned[name] ?? []),
      };
      return chain;
    });
    return reads;
  };

  const survey = (over: Record<string, unknown>) => ({
    id: 'sv',
    instrumentId: 'inst-1',
    campaignSessionId: null,
    farmerId: null,
    status: 'completed',
    backendSurveyId: null,
    ownerUserId: 'user-1',
    createdAt: new Date('2026-09-20T10:00:00.000Z'),
    updatedAt: new Date('2026-09-20T10:00:00.000Z'),
    ...over,
  });
  const resp = (surveyId: string, questionId: string, over: Record<string, unknown> = {}) => ({
    id: `${surveyId}:${questionId}`,
    surveyId,
    questionId,
    optionId: null,
    optionIds: null,
    textValue: 'x',
    numericValue: null,
    booleanValue: null,
    otherText: null,
    mediaLocalPath: null,
    mimeType: null,
    ...over,
  });
  const question = (questionId: string, order: number, over: Record<string, unknown> = {}) => ({
    questionId,
    text: questionId,
    isRequired: false,
    order,
    type: { name: 'open_text' },
    options: [],
    ...over,
  });
  const instrumentRow = (sections: unknown[]) => ({
    id: 'inst-1',
    data: JSON.stringify({ instrumentId: 'inst-1', name: 'Bloque 1', sections }),
    cachedAt: new Date(),
  });

  it('devuelve las del dueño y las sin dueño, y descarta las de otros', async () => {
    cannedDb({
      surveys: [
        survey({ id: 'mine', ownerUserId: 'user-1' }),
        survey({ id: 'legacy', ownerUserId: null }),
        survey({ id: 'theirs', ownerUserId: 'user-2' }),
      ],
      responses: [resp('mine', 'q1'), resp('legacy', 'q1'), resp('theirs', 'q1')],
    });

    const items = await surveyDraftStore.listFinished('user-1');

    expect(items.map((i) => i.clientSurveyId).sort()).toEqual(['legacy', 'mine']);
  });

  it('excluye las encuestas sin respuestas', async () => {
    cannedDb({
      surveys: [survey({ id: 'answered' }), survey({ id: 'skipped' })],
      responses: [resp('answered', 'q1')],
    });

    const items = await surveyDraftStore.listFinished('user-1');

    expect(items.map((i) => i.clientSurveyId)).toEqual(['answered']);
  });

  it('resuelve el productor por la encuesta y, si falta, por la sesión', async () => {
    cannedDb({
      surveys: [
        survey({ id: 'direct', farmerId: 'f-1' }),
        survey({ id: 'viaSession', campaignSessionId: 'local-sess' }),
        survey({ id: 'unknown' }),
      ],
      responses: [resp('direct', 'q1'), resp('viaSession', 'q1'), resp('unknown', 'q1')],
      pendingSessions: [{ localSessionId: 'local-sess', realSessionId: null, farmerId: 'f-2' }],
      farmerCache: [
        { farmerId: 'f-1', name: 'Ana Pérez', documentId: '1001' },
        { farmerId: 'f-2', name: 'Luis Gómez', documentId: null },
      ],
    });

    const byId = Object.fromEntries(
      (await surveyDraftStore.listFinished('user-1')).map((i) => [i.clientSurveyId, i]),
    );

    expect(byId.direct).toMatchObject({ farmerName: 'Ana Pérez', farmerDocumentId: '1001' });
    expect(byId.viaSession).toMatchObject({ farmerName: 'Luis Gómez', farmerDocumentId: null });
    expect(byId.unknown).toMatchObject({ farmerName: null, farmerDocumentId: null });
  });

  it('deja el instrumento en null cuando salió de la caché', async () => {
    cannedDb({ surveys: [survey({ id: 'a' })], responses: [resp('a', 'q1'), resp('a', 'q2')] });

    const [item] = await surveyDraftStore.listFinished('user-1');

    expect(item.instrumentName).toBeNull();
    expect(item.responseCount).toBe(2);
  });

  it('cuenta solo las preguntas visibles con valor del instrumento en caché', async () => {
    cannedDb({
      surveys: [survey({ id: 'a' })],
      responses: [
        resp('a', 'q-gate', { textValue: null, booleanValue: false }),
        resp('a', 'q-hidden'),
        resp('a', 'q-empty', { textValue: '   ' }),
        resp('a', 'q-shown'),
      ],
      instrumentCache: [
        instrumentRow([
          {
            sectionId: 's1',
            name: 'S1',
            order: 1,
            questions: [
              question('q-gate', 1, { type: { name: 'yes_no' } }),
              question('q-hidden', 2, { conditionQuestionId: 'q-gate', conditionValue: 'true' }),
              question('q-empty', 3),
              question('q-shown', 4, { conditionQuestionId: 'q-gate', conditionValue: 'false' }),
            ],
          },
        ]),
      ],
    });

    const [item] = await surveyDraftStore.listFinished('user-1');

    expect(item.instrumentName).toBe('Bloque 1');
    expect(item.responseCount).toBe(2); // q-gate y q-shown
  });

  it('marca syncFailed solo si la cola tiene la encuesta en failed_validation', async () => {
    cannedDb({
      surveys: [survey({ id: 'bad' }), survey({ id: 'ok', status: 'synced', backendSurveyId: 'srv-9' })],
      responses: [resp('bad', 'q1'), resp('ok', 'q1')],
      syncQueue: [{ surveyId: 'bad', status: 'failed_validation' }],
    });

    const byId = Object.fromEntries(
      (await surveyDraftStore.listFinished('user-1')).map((i) => [i.clientSurveyId, i]),
    );

    expect(byId.bad).toMatchObject({ syncFailed: true, status: 'completed' });
    expect(byId.ok).toMatchObject({ syncFailed: false, status: 'synced', backendSurveyId: 'srv-9' });
    expect(byId.ok.createdAt).toBe('2026-09-20T10:00:00.000Z');
  });

  it('no hace lecturas por encuesta: el número de consultas es fijo', async () => {
    const many = Array.from({ length: 25 }, (_, i) => survey({ id: `s${i}`, farmerId: `f${i}` }));
    const reads = cannedDb({
      surveys: many,
      responses: many.map((s) => resp(s.id as string, 'q1')),
    });

    await surveyDraftStore.listFinished('user-1');

    expect(reads.length).toBeLessThanOrEqual(6);
  });

  it('devuelve [] sin tocar otras tablas cuando no hay encuestas terminadas', async () => {
    const reads = cannedDb({});

    expect(await surveyDraftStore.listFinished('user-1')).toEqual([]);
    expect(reads).toEqual(['surveys']);
  });
});
