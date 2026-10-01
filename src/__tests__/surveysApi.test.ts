/**
 * Spec 92 — contrato de `getSurveyResponses` con `GET /api/surveys/:id/responses`.
 * El backend devuelve `{ surveyId, instrumentName, syncedAt, responses: [...] }`.
 */
jest.mock("../api/httpClient", () => ({
  httpClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

import { httpClient } from "../api/httpClient";
import { getSurveyResponses } from "../api/surveys";

const get = httpClient.get as jest.Mock;

describe("getSurveyResponses", () => {
  it("devuelve el arreglo `responses` del cuerpo, no el objeto completo", async () => {
    const row = { responseId: "r1", questionId: "q1", questionText: "¿?", questionType: "open_text", sectionId: "s1", sectionTitle: "S", sectionOrder: 1, textValue: "x", numericValue: null, booleanValue: null, optionText: null, hasAttachment: false };
    get.mockResolvedValueOnce({ surveyId: "sv-1", instrumentName: "I", syncedAt: null, responses: [row] });

    await expect(getSurveyResponses("sv-1")).resolves.toEqual([row]);
    expect(get).toHaveBeenCalledWith("/api/surveys/sv-1/responses");
  });

  it("devuelve [] si el cuerpo no trae `responses`", async () => {
    get.mockResolvedValueOnce({ surveyId: "sv-2", instrumentName: "I", syncedAt: null });
    await expect(getSurveyResponses("sv-2")).resolves.toEqual([]);
  });
});
