import { httpClient } from "./httpClient";
import { endpoints } from "./endpoints";

interface CreatedOption {
  optionId: string;
  text: string;
}

export const createQuestionOption = (questionId: string, text: string): Promise<CreatedOption> =>
  httpClient.post<CreatedOption>(endpoints.questionOptions(questionId), { text });
