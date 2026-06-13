/**
 * Unit tests for surveyDraftStore.
 *
 * The Drizzle `db` module is mocked with a simple in-memory store that
 * simulates the subset of the Drizzle query builder API used by surveyDraftStore.
 */

import type { InstrumentDraftAnswer } from '../../types';

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
        from: jest.fn().mockImplementation((table: { _: { name?: string } } | unknown) => {
          // Detect which table by inspecting Drizzle table object name or fallback
          _table = String(table).includes('responses') ? 'responses' : 'surveys';
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

jest.mock('../../storage/db/db', () => ({
  get db() {
    return mockDb;
  },
}));

// Import SUT after mock
import { surveyDraftStore } from '../../storage/surveyDraftStore';

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
