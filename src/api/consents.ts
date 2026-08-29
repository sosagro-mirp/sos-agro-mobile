import { httpClient } from './httpClient';
import { endpoints } from './endpoints';

export interface ConsentDocument {
  consentDocumentId: string;
  version: string;
  title: string;
  body: string;
  dataProcessingClause: string;
  multimediaClause: string;
  rightsClause: string;
  responsibleEntity: string;
  contactEmail: string;
  status: 'draft' | 'published' | 'archived';
  publishedAt: string | null;
}

export type ConsentVigencyStatus = 'valid' | 'outdated_version' | 'revoked' | 'none';

export interface ConsentVigency {
  status: ConsentVigencyStatus;
  acceptedVersion: string | null;
}

export interface CreateConsentPayload {
  sessionId: string;
  consentDocumentId: string;
  respondentName?: string;
  acceptedDataProcessing: boolean;
  acceptedPhoto: boolean;
  acceptedAudio: boolean;
  acceptedVideo: boolean;
  acceptedFollowUpContact: boolean;
  acceptedAt: string;
}

export interface ConsentRecordResponse {
  consentRecordId: string;
  consentDocument: ConsentDocument;
}

export const fetchActiveConsentDocument = (): Promise<ConsentDocument> =>
  httpClient.get(endpoints.consentDocumentActive);

export const submitConsent = (payload: CreateConsentPayload): Promise<ConsentRecordResponse> =>
  httpClient.post(endpoints.consents, payload);

export const fetchFarmerConsentStatus = (farmerId: string): Promise<ConsentVigency> =>
  httpClient.get(endpoints.farmerConsentStatus(farmerId));
