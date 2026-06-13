import type { FlattenedQuestionItem, InstrumentSection } from "../types";

export function flattenSections(sections: InstrumentSection[]): FlattenedQuestionItem[] {
  return [...sections]
    .sort((a, b) => a.order - b.order)
    .flatMap((section) =>
      [...section.questions]
        .sort((a, b) => a.order - b.order)
        .map((question) => ({
          sectionId: section.sectionId,
          sectionName: section.name,
          sectionOrder: section.order,
          question,
        })),
    );
}
