import React from "react";
import type { FlattenedQuestionItem, InstrumentDraftAnswer } from "../../types";
import { OpenTextInput } from "../inputs/OpenTextInput";
import { NumericInput } from "../inputs/NumericInput";
import { SingleChoiceList } from "../inputs/SingleChoiceList";
import { MultipleChoiceList } from "../inputs/MultipleChoiceList";
import { LikertScale } from "../inputs/LikertScale";
import { ComplianceInput } from "../inputs/ComplianceInput";
import { ImageCaptureInput } from "../inputs/ImageCaptureInput";
import { VoiceRecordingInput } from "../inputs/VoiceRecordingInput";
import { DocumentPickerInput } from "../inputs/DocumentPickerInput";

interface QuestionRendererProps {
  item: FlattenedQuestionItem;
  answer: InstrumentDraftAnswer | undefined;
  onChange: (answer: InstrumentDraftAnswer) => void;
}

export const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  item,
  answer,
  onChange,
}) => {
  const { question } = item;
  const { questionId, options, type } = question;

  switch (type.name) {
    case "open_text":
      return (
        <OpenTextInput
          questionId={questionId}
          value={answer?.textValue}
          onChange={onChange}
        />
      );

    case "numeric":
      return (
        <NumericInput
          questionId={questionId}
          value={answer?.numericValue}
          onChange={onChange}
        />
      );

    case "yes_no":
      return (
        <SingleChoiceList
          questionId={questionId}
          options={options}
          value={answer?.optionId}
          booleanValue={answer?.booleanValue}
          onChange={onChange}
        />
      );

    case "single_choice":
      return (
        <SingleChoiceList
          questionId={questionId}
          options={options}
          value={answer?.optionId}
          onChange={onChange}
        />
      );

    case "likert":
      return (
        <LikertScale
          questionId={questionId}
          options={options}
          value={answer?.optionId}
          onChange={onChange}
        />
      );

    case "multiple_choice":
      return (
        <MultipleChoiceList
          questionId={questionId}
          options={options}
          selectedIds={answer?.optionIds ?? []}
          otherText={answer?.otherText}
          onChange={onChange}
        />
      );

    case "compliance":
      return (
        <ComplianceInput
          questionId={questionId}
          options={options}
          value={answer?.optionId}
          onChange={onChange}
        />
      );

    case "image":
      return (
        <ImageCaptureInput
          questionId={questionId}
          value={answer?.mediaLocalPath}
          onChange={onChange}
        />
      );

    case "voice_recording":
      return (
        <VoiceRecordingInput
          questionId={questionId}
          value={answer?.mediaLocalPath}
          onChange={onChange}
        />
      );

    case "document":
      return (
        <DocumentPickerInput
          questionId={questionId}
          value={answer?.mediaLocalPath}
          onChange={onChange}
        />
      );

    default:
      return (
        <OpenTextInput
          questionId={questionId}
          value={answer?.textValue}
          onChange={onChange}
        />
      );
  }
};
