export interface CampaignActiveSummary {
  campaignId: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface StepConditionRender {
  conditionId: string;
  order: number;
  logicalOperator: 'AND' | 'OR' | null;
  conditionType: 'question' | 'crop';
  conditionCrop: { cropId: string; name: string } | null;
  conditionQuestion: { questionId: string; text: string } | null;
  conditionValue: string | null;
}

export interface CampaignStepRender {
  stepId: string;
  order: number;
  instrument: { instrumentId: string; name: string; isActive: boolean };
  conditions: StepConditionRender[];
}

export interface CampaignRender extends CampaignActiveSummary {
  steps: CampaignStepRender[];
  availableCrops: { cropId: string; name: string }[];
}

export interface CampaignSessionResponse {
  sessionId: string;
  campaign: { campaignId: string; name: string };
}

export interface NextStepResponse {
  stepId?: string;
  order?: number;
  instrument?: { instrumentId: string; name: string; isActive: boolean };
  totalSteps?: number;
  completedCount?: number;
  nextStep?: null;
}

export interface CreateCampaignSessionPayload {
  campaignId: string;
  farmerId?: string;
  userId?: string;
  actorTypeId?: string;
  departmentId?: string;
  townId?: string;
  vereda?: string;
  cropId?: string;
  cropIds?: string[];
}
