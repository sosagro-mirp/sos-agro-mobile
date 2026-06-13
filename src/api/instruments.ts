import { httpClient } from "./httpClient";
import { endpoints } from "./endpoints";
import type { InstrumentResponse } from "../types";

export const fetchInstrumentRender = (id: string) =>
  httpClient.get<InstrumentResponse>(endpoints.instrumentRender(id));
