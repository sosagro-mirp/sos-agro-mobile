import { httpClient } from "./httpClient";
import { endpoints } from "./endpoints";
import type { CreateResponsePayload } from "../types";

export const submitResponsesBatch = (responses: CreateResponsePayload[]) =>
  httpClient.post<void>(endpoints.responsesBatch, responses);
