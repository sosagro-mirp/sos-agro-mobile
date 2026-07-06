import { httpClient } from './httpClient';
import { endpoints } from './endpoints';

export interface PostChangeRequestPayload {
  description: string;
  farmerId?: string;
  localId: string;
}

export interface ResolvedChangeRequest {
  changeRequestId: string;
  localId: string | null;
  resolvedAt: string;
}

export async function postChangeRequest(payload: PostChangeRequestPayload): Promise<void> {
  await httpClient.post(endpoints.changeRequests, payload);
}

export async function fetchMyResolved(since: Date): Promise<ResolvedChangeRequest[]> {
  const sinceIso = since.toISOString();
  const result = await httpClient.get<ResolvedChangeRequest[]>(
    `${endpoints.changeRequestsMyResolved}?since=${encodeURIComponent(sinceIso)}`
  );
  return result;
}
