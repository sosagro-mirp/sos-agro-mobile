import React from "react";
import type { FlattenedQuestionItem, InstrumentDraftAnswer } from "../../types";
import { OpenTextInput } from "../inputs/OpenTextInput";
import { NumericInput } from "../inputs/NumericInput";
import { GpsCoordinateInput } from "../inputs/GpsCoordinateInput";
import { SingleChoiceList } from "../inputs/SingleChoiceList";
import { MultipleChoiceList } from "../inputs/MultipleChoiceList";
import { LikertScale } from "../inputs/LikertScale";
import { ComplianceInput } from "../inputs/ComplianceInput";
import { ImageCaptureInput } from "../inputs/ImageCaptureInput";
import { VoiceRecordingInput } from "../inputs/VoiceRecordingInput";
import { DocumentPickerInput } from "../inputs/DocumentPickerInput";

const GPS_SYSTEM_FIELDS = new Set(["farm.latitude", "farm.longitude"]);

interface QuestionRendererProps {
  item: FlattenedQuestionItem;
  answer: InstrumentDraftAnswer | undefined;
  onChange: (answer: InstrumentDraftAnswer) => void;
  onAltitudeObtained?: (altitude: number) => void;
}

export const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  item,
  answer,
  onChange,
  onAltitudeObtained,
}) => {
  const { question } = item;
  const { questionId, options, type } = question;

  if (question.systemField && GPS_SYSTEM_FIELDS.has(question.systemField)) {
    return (
      <GpsCoordinateInput
        questionId={questionId}
        fieldType={question.systemField === "farm.latitude" ? "latitude" : "longitude"}
        value={answer?.numericValue}
        onChange={onChange}
        onAltitudeObtained={onAltitudeObtained}
      />
    );
  }

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
