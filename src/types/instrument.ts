export type QuestionTypeName =
  | "open_text"
  | "numeric"
  | "yes_no"
  | "single_choice"
  | "multiple_choice"
  | "likert"
  | "compliance"
  | "image"
  | "voice_recording"
  | "document"
  | "video"
  | (string & {});

export interface InstrumentType {
  typeId: string;
  name: QuestionTypeName;
}

export interface InstrumentOption {
  optionId: string;
  text: string;
  value: string | number | boolean | null;
  isOther?: boolean;
}

export interface InstrumentQuestion {
  questionId: string;
  text: string;
  isRequired: boolean;
  isSelectionCriteria?: boolean;
  order: number;
  systemField?: string | null;
  type: InstrumentType;
  options: InstrumentOption[];
  conditionQuestionId?: string | null;
  conditionValue?: string | null;
}

export interface InstrumentDraftAnswer {
  questionId: string;
  optionId?: string;
  optionIds?: string[];
  textValue?: string;
  numericValue?: number;
  booleanValue?: boolean;
  otherText?: string;
  mediaLocalPath?: string;
  mimeType?: string;
}

export interface CreateResponsePayload extends InstrumentDraftAnswer {
  surveyId: string;
  attachmentId?: string;
}

export interface InstrumentSection {
  sectionId: string;
  name: string;
  order: number;
  questions: InstrumentQuestion[];
}

export interface InstrumentResponse {
  instrumentId: string;
  name: string;
  version: number;
  publishDate: string;
  isActive: boolean;
  code?: string | null;
  sections: InstrumentSection[];
}

export interface SurveyResponse {
  surveyId: string;
}

export type SubmitResult =
  | { outcome: "submitted" }
  | { outcome: "saved_offline" }
  | { outcome: "session_expired" }
  | { outcome: "error"; message: string };

export interface InitializeSurveyPayload {
  localId: string;
  instrumentName: string;
  sections: InstrumentSection[];
}

export interface FlattenedQuestionItem {
  sectionId: string;
  sectionName: string;
  sectionOrder: number;
  question: InstrumentQuestion;
}

// ── Actor / instrument summaries ─────────────────────────────────────────────

export interface ActorTypeSummary {
  actorTypeId: string;
  name: string;
  description: string | null;
}

export interface InstrumentSummary {
  instrumentId: string;
  name: string;
  version: number;
  publishDate: string;
  isActive: boolean;
  actorTypes: ActorTypeSummary[];
}

// ── Pre-survey form S1/S2 ────────────────────────────────────────────────────

export interface CropSummary {
  cropId: string;
  name: string;
}

export interface FarmerSearchResult {
  farmerId: string;
  name: string;
  lastName: string | null;
  documentId: string | null;
  phone?: string | null;
  farm?: { name: string } | null;
}

export interface ExtractFarmerResult {
  farmer: FarmerSearchResult;
  existed: boolean;
}

export interface ExtractCropsResult {
  crops: CropSummary[];
}

export type LastFarmerResult = {
  farmerId: string;
  name: string;
  lastName: string | null;
  farm?: { name: string };
} | null;

export interface DuplicateCheckResult {
  hasDuplicate: boolean;
  surveyId?: string;
}
