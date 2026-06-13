import { buildResponsesPayload } from '../../lib/buildResponsesPayload';
import { flattenSections } from '../../lib/flattenSections';
import { isAnswerComplete } from '../../lib/isAnswerComplete';
import { isQuestionVisible } from '../../lib/isQuestionVisible';
import type {
  InstrumentDraftAnswer,
  InstrumentQuestion,
  InstrumentSection,
} from '../../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeQuestion(
  overrides: Partial<InstrumentQuestion> & { typeName?: string } = {},
): InstrumentQuestion {
  const { typeName = 'open_text', ...rest } = overrides;
  return {
    questionId: 'q1',
    text: 'Test question',
    isRequired: true,
    order: 1,
    type: { typeId: 'tid', name: typeName },
    options: [],
    conditionQuestionId: null,
    conditionValue: null,
    ...rest,
  };
}

function makeSection(
  sectionId: string,
  order: number,
  questions: InstrumentQuestion[],
): InstrumentSection {
  return { sectionId, name: `Section ${sectionId}`, order, questions };
}

// ─── flattenSections ─────────────────────────────────────────────────────────

describe('flattenSections', () => {
  it('returns an empty array for an empty sections list', () => {
    expect(flattenSections([])).toEqual([]);
  });

  it('flattens a single section into individual question items', () => {
    const q1 = makeQuestion({ questionId: 'q1', order: 1 });
    const q2 = makeQuestion({ questionId: 'q2', order: 2 });
    const section = makeSection('s1', 1, [q1, q2]);

    const result = flattenSections([section]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ sectionId: 's1', question: q1 });
    expect(result[1]).toMatchObject({ sectionId: 's1', question: q2 });
  });

  it('sorts sections by order before flattening', () => {
    const qA = makeQuestion({ questionId: 'qA', order: 1 });
    const qB = makeQuestion({ questionId: 'qB', order: 1 });
    const s2 = makeSection('s2', 2, [qA]);
    const s1 = makeSection('s1', 1, [qB]);

    const result = flattenSections([s2, s1]);

    // s1 (order 1) should come first
    expect(result[0].sectionId).toBe('s1');
    expect(result[1].sectionId).toBe('s2');
  });

  it('sorts questions within each section by order', () => {
    const q3 = makeQuestion({ questionId: 'q3', order: 3 });
    const q1 = makeQuestion({ questionId: 'q1', order: 1 });
    const q2 = makeQuestion({ questionId: 'q2', order: 2 });
    const section = makeSection('s1', 1, [q3, q1, q2]);

    const result = flattenSections([section]);

    expect(result.map((r) => r.question.questionId)).toEqual(['q1', 'q2', 'q3']);
  });

  it('attaches sectionName and sectionOrder to each item', () => {
    const q = makeQuestion({ questionId: 'q1', order: 1 });
    const section = makeSection('s1', 5, [q]);

    const result = flattenSections([section]);

    expect(result[0].sectionName).toBe('Section s1');
    expect(result[0].sectionOrder).toBe(5);
  });

  it('does not mutate the original sections array', () => {
    const q1 = makeQuestion({ questionId: 'q1', order: 1 });
    const sections = [makeSection('s1', 1, [q1])];
    const originalRef = sections[0];

    flattenSections(sections);

    expect(sections[0]).toBe(originalRef);
  });
});

// ─── isQuestionVisible ────────────────────────────────────────────────────────

describe('isQuestionVisible', () => {
  it('returns true when there is no condition', () => {
    const q = makeQuestion({ conditionQuestionId: null, conditionValue: null });
    expect(isQuestionVisible(q, {})).toBe(true);
  });

  it('returns false when trigger question has no answer', () => {
    const q = makeQuestion({
      questionId: 'q2',
      conditionQuestionId: 'q1',
      conditionValue: 'true',
    });
    expect(isQuestionVisible(q, {})).toBe(false);
  });

  it('resolves a yes_no condition that evaluates to true', () => {
    const q = makeQuestion({
      conditionQuestionId: 'trigger',
      conditionValue: 'true',
    });
    const answers: Record<string, InstrumentDraftAnswer> = {
      trigger: { questionId: 'trigger', booleanValue: true },
    };
    expect(isQuestionVisible(q, answers)).toBe(true);
  });

  it('resolves a yes_no condition that evaluates to false', () => {
    const q = makeQuestion({
      conditionQuestionId: 'trigger',
      conditionValue: 'true',
    });
    const answers: Record<string, InstrumentDraftAnswer> = {
      trigger: { questionId: 'trigger', booleanValue: false },
    };
    expect(isQuestionVisible(q, answers)).toBe(false);
  });

  it('resolves a single_choice condition matching the expected optionId', () => {
    const q = makeQuestion({
      conditionQuestionId: 'trigger',
      conditionValue: 'opt-yes',
    });
    const answers: Record<string, InstrumentDraftAnswer> = {
      trigger: { questionId: 'trigger', optionId: 'opt-yes' },
    };
    expect(isQuestionVisible(q, answers)).toBe(true);
  });

  it('hides a single_choice conditioned question when optionId does not match', () => {
    const q = makeQuestion({
      conditionQuestionId: 'trigger',
      conditionValue: 'opt-yes',
    });
    const answers: Record<string, InstrumentDraftAnswer> = {
      trigger: { questionId: 'trigger', optionId: 'opt-no' },
    };
    expect(isQuestionVisible(q, answers)).toBe(false);
  });
});

// ─── isAnswerComplete ─────────────────────────────────────────────────────────

describe('isAnswerComplete', () => {
  it('returns true for optional questions regardless of answer', () => {
    const q = makeQuestion({ isRequired: false, typeName: 'open_text' });
    expect(isAnswerComplete(q, undefined)).toBe(true);
    expect(isAnswerComplete(q, { questionId: 'q1' })).toBe(true);
  });

  it('returns false for required questions with no answer', () => {
    const q = makeQuestion({ isRequired: true, typeName: 'open_text' });
    expect(isAnswerComplete(q, undefined)).toBe(false);
  });

  it('open_text: complete when textValue is non-empty', () => {
    const q = makeQuestion({ isRequired: true, typeName: 'open_text' });
    expect(isAnswerComplete(q, { questionId: 'q1', textValue: 'hello' })).toBe(true);
    expect(isAnswerComplete(q, { questionId: 'q1', textValue: '  ' })).toBe(false);
    expect(isAnswerComplete(q, { questionId: 'q1', textValue: '' })).toBe(false);
  });

  it('numeric: complete when numericValue is defined (including 0)', () => {
    const q = makeQuestion({ isRequired: true, typeName: 'numeric' });
    expect(isAnswerComplete(q, { questionId: 'q1', numericValue: 0 })).toBe(true);
    expect(isAnswerComplete(q, { questionId: 'q1', numericValue: 42 })).toBe(true);
    expect(isAnswerComplete(q, { questionId: 'q1' })).toBe(false);
  });

  it('yes_no: complete when booleanValue is defined (including false)', () => {
    const q = makeQuestion({ isRequired: true, typeName: 'yes_no' });
    expect(isAnswerComplete(q, { questionId: 'q1', booleanValue: false })).toBe(true);
    expect(isAnswerComplete(q, { questionId: 'q1', booleanValue: true })).toBe(true);
    expect(isAnswerComplete(q, { questionId: 'q1' })).toBe(false);
  });

  it('single_choice: complete when optionId is set', () => {
    const q = makeQuestion({ isRequired: true, typeName: 'single_choice' });
    expect(isAnswerComplete(q, { questionId: 'q1', optionId: 'opt-1' })).toBe(true);
    expect(isAnswerComplete(q, { questionId: 'q1', optionId: '' })).toBe(false);
  });

  it('likert: complete when optionId is set', () => {
    const q = makeQuestion({ isRequired: true, typeName: 'likert' });
    expect(isAnswerComplete(q, { questionId: 'q1', optionId: 'opt-2' })).toBe(true);
  });

  it('multiple_choice: complete when at least one option is selected', () => {
    const q = makeQuestion({
      isRequired: true,
      typeName: 'multiple_choice',
      options: [
        { optionId: 'a', text: 'A', value: 'a' },
        { optionId: 'b', text: 'B', value: 'b' },
      ],
    });
    expect(isAnswerComplete(q, { questionId: 'q1', optionIds: ['a'] })).toBe(true);
    expect(isAnswerComplete(q, { questionId: 'q1', optionIds: [] })).toBe(false);
  });

  it('multiple_choice: requires otherText when "other" option is selected', () => {
    const q = makeQuestion({
      isRequired: true,
      typeName: 'multiple_choice',
      options: [
        { optionId: 'a', text: 'A', value: 'a' },
        { optionId: 'other-id', text: 'Otro', value: null, isOther: true },
      ],
    });
    // Selected other but no text
    expect(
      isAnswerComplete(q, { questionId: 'q1', optionIds: ['other-id'], otherText: '' }),
    ).toBe(false);
    // Selected other with text
    expect(
      isAnswerComplete(q, { questionId: 'q1', optionIds: ['other-id'], otherText: 'Custom' }),
    ).toBe(true);
    // Did not select other — no otherText required
    expect(isAnswerComplete(q, { questionId: 'q1', optionIds: ['a'] })).toBe(true);
  });
});

// ─── buildResponsesPayload ────────────────────────────────────────────────────

describe('buildResponsesPayload', () => {
  const surveyId = 'survey-abc';

  function item(overrides: Partial<InstrumentQuestion> & { typeName?: string } = {}) {
    const q = makeQuestion(overrides);
    return { sectionId: 's1', sectionName: 'S1', sectionOrder: 1, question: q };
  }

  it('returns empty array when there are no answered questions', () => {
    const questions = [item({ questionId: 'q1' })];
    expect(buildResponsesPayload(surveyId, questions, {})).toEqual([]);
  });

  it('builds payload for open_text answer', () => {
    const questions = [item({ questionId: 'q1', typeName: 'open_text' })];
    const answers = { q1: { questionId: 'q1', textValue: '  hello  ' } };
    const result = buildResponsesPayload(surveyId, questions, answers);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ surveyId, questionId: 'q1', textValue: 'hello' });
  });

  it('trims whitespace from textValue', () => {
    const questions = [item({ questionId: 'q1', typeName: 'open_text' })];
    const answers = { q1: { questionId: 'q1', textValue: '   ' } };
    const result = buildResponsesPayload(surveyId, questions, answers);

    // empty textValue after trim → excluded, but surveyId+questionId still included?
    // per implementation: trimmedText falsy → textValue not included; hasValue check
    expect(result).toHaveLength(0);
  });

  it('builds payload for numeric answer', () => {
    const questions = [item({ questionId: 'q1', typeName: 'numeric' })];
    const answers = { q1: { questionId: 'q1', numericValue: 42 } };
    const result = buildResponsesPayload(surveyId, questions, answers);

    expect(result[0]).toMatchObject({ surveyId, questionId: 'q1', numericValue: 42 });
  });

  it('includes numericValue: 0', () => {
    const questions = [item({ questionId: 'q1', typeName: 'numeric' })];
    const answers = { q1: { questionId: 'q1', numericValue: 0 } };
    const result = buildResponsesPayload(surveyId, questions, answers);

    expect(result[0]).toMatchObject({ numericValue: 0 });
  });

  it('builds payload for yes_no answer', () => {
    const questions = [item({ questionId: 'q1', typeName: 'yes_no' })];
    const answers = { q1: { questionId: 'q1', booleanValue: false } };
    const result = buildResponsesPayload(surveyId, questions, answers);

    expect(result[0]).toMatchObject({ surveyId, questionId: 'q1', booleanValue: false });
  });

  it('builds payload for single_choice answer', () => {
    const questions = [item({ questionId: 'q1', typeName: 'single_choice' })];
    const answers = { q1: { questionId: 'q1', optionId: 'opt-x' } };
    const result = buildResponsesPayload(surveyId, questions, answers);

    expect(result[0]).toMatchObject({ surveyId, questionId: 'q1', optionId: 'opt-x' });
  });

  it('builds one payload item per selected option for multiple_choice', () => {
    const questions = [item({ questionId: 'q1', typeName: 'multiple_choice' })];
    const answers = { q1: { questionId: 'q1', optionIds: ['opt-a', 'opt-b', 'opt-c'] } };
    const result = buildResponsesPayload(surveyId, questions, answers);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.optionId)).toEqual(['opt-a', 'opt-b', 'opt-c']);
    result.forEach((r) => expect(r.surveyId).toBe(surveyId));
  });

  it('returns empty array for multiple_choice with no selected options', () => {
    const questions = [item({ questionId: 'q1', typeName: 'multiple_choice' })];
    const answers = { q1: { questionId: 'q1', optionIds: [] } };
    expect(buildResponsesPayload(surveyId, questions, answers)).toHaveLength(0);
  });

  it('excludes invisible questions (conditioned and trigger not answered)', () => {
    const trigger = makeQuestion({
      questionId: 'q1',
      typeName: 'yes_no',
      conditionQuestionId: null,
      conditionValue: null,
    });
    const dependent = makeQuestion({
      questionId: 'q2',
      typeName: 'open_text',
      conditionQuestionId: 'q1',
      conditionValue: 'true',
    });
    const questions = [
      { sectionId: 's1', sectionName: 'S1', sectionOrder: 1, question: trigger },
      { sectionId: 's1', sectionName: 'S1', sectionOrder: 1, question: dependent },
    ];
    // q1 answered "false", so q2 (conditionValue='true') should be invisible
    const answers = {
      q1: { questionId: 'q1', booleanValue: false },
      q2: { questionId: 'q2', textValue: 'should be excluded' },
    };
    const result = buildResponsesPayload(surveyId, questions, answers);
    const questionIds = result.map((r) => r.questionId);

    expect(questionIds).not.toContain('q2');
    expect(questionIds).toContain('q1');
  });

  it('includes visible conditioned question when condition is met', () => {
    const trigger = makeQuestion({
      questionId: 'q1',
      typeName: 'yes_no',
      conditionQuestionId: null,
      conditionValue: null,
    });
    const dependent = makeQuestion({
      questionId: 'q2',
      typeName: 'open_text',
      conditionQuestionId: 'q1',
      conditionValue: 'true',
    });
    const questions = [
      { sectionId: 's1', sectionName: 'S1', sectionOrder: 1, question: trigger },
      { sectionId: 's1', sectionName: 'S1', sectionOrder: 1, question: dependent },
    ];
    const answers = {
      q1: { questionId: 'q1', booleanValue: true },
      q2: { questionId: 'q2', textValue: 'visible answer' },
    };
    const result = buildResponsesPayload(surveyId, questions, answers);
    const questionIds = result.map((r) => r.questionId);

    expect(questionIds).toContain('q1');
    expect(questionIds).toContain('q2');
  });

  it('does not include items with no meaningful value', () => {
    // answer has no optionId, no textValue, no numericValue, no booleanValue
    const questions = [item({ questionId: 'q1', typeName: 'open_text' })];
    const answers = { q1: { questionId: 'q1' } };
    const result = buildResponsesPayload(surveyId, questions, answers);
    expect(result).toHaveLength(0);
  });
});
