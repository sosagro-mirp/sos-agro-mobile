import { httpClient } from "./httpClient";
import { endpoints } from "./endpoints";
import type { CreateResponsePayload } from "../types";

export const submitResponsesBatch = (responses: CreateResponsePayload[]) =>
  httpClient.post<void>(endpoints.responsesBatch, responses);

// POST /api/responses (single, no idempotency guard) — unlike
// submitResponsesBatch, which no-ops once the survey already has any
// responses. Used to link a media attachment that syncs after the fact
// (see MediaUploadService.retryEntry).
export const createResponse = (response: CreateResponsePayload) =>
  httpClient.post<void>(endpoints.responses, response);
