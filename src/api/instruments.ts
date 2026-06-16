import { httpClient } from "./httpClient";
import { endpoints } from "./endpoints";
import type { InstrumentResponse } from "../types";

export const fetchInstrumentRender = (id: string) =>
  httpClient.get<InstrumentResponse>(endpoints.instrumentRender(id));

export const fetchInstrumentByCode = (code: 'S1' | 'S2'): Promise<{ instrumentId: string; name: string }> =>
  httpClient.get(endpoints.instrumentByCode(code));
