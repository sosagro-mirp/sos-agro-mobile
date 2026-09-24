import { httpClient, type RequestOptions } from './httpClient';
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

export async function postChangeRequest(
  payload: PostChangeRequestPayload,
  opts?: RequestOptions,
): Promise<void> {
  await httpClient.post(endpoints.changeRequests, payload, ...(opts ? [opts] : []));
}

export async function fetchMyResolved(
  since: Date,
  opts?: RequestOptions,
): Promise<ResolvedChangeRequest[]> {
  const sinceIso = since.toISOString();
  const result = await httpClient.get<ResolvedChangeRequest[]>(
    `${endpoints.changeRequestsMyResolved}?since=${encodeURIComponent(sinceIso)}`,
    ...(opts ? [opts] : []),
  );
  return result;
}
