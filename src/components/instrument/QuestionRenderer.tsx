import React, { useEffect, useMemo, useRef } from "react";
import type { FlattenedQuestionItem, InstrumentDraftAnswer, InstrumentOption } from "../../types";
import { useInstrumentSurveyStore } from "../../store/useInstrumentSurveyStore";
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

  const { flattenedQuestions, answers, setAnswer } = useInstrumentSurveyStore();

  // Preguntas geográficas para filtrado de municipios
  const deptQuestion = useMemo(
    () => flattenedQuestions.find((fq) => fq.question.systemField === "farm.department")?.question ?? null,
    [flattenedQuestions],
  );
  const townQuestion = useMemo(
    () => flattenedQuestions.find((fq) => fq.question.systemField === "farm.town")?.question ?? null,
    [flattenedQuestions],
  );

  const selectedDeptOptionId = deptQuestion ? (answers[deptQuestion.questionId]?.optionId ?? null) : null;

  const selectedDepartmentId = useMemo(() => {
    if (!deptQuestion || !selectedDeptOptionId) return null;
    const opt = (deptQuestion.options as InstrumentOption[]).find((o) => o.optionId === selectedDeptOptionId);
    return opt?.departmentId ?? null;
  }, [deptQuestion, selectedDeptOptionId]);

  // Limpiar respuesta de Municipio cuando cambia la de Departamento
  const prevDeptOptionIdRef = useRef<string | null | undefined>(selectedDeptOptionId);
  useEffect(() => {
    if (prevDeptOptionIdRef.current !== selectedDeptOptionId && townQuestion) {
      if (prevDeptOptionIdRef.current !== undefined) {
        setAnswer(townQuestion.questionId, { questionId: townQuestion.questionId });
      }
    }
    prevDeptOptionIdRef.current = selectedDeptOptionId;
  }, [selectedDeptOptionId, townQuestion, setAnswer]);

  // Opciones filtradas para farm.town
  const displayOptions = useMemo<InstrumentOption[]>(() => {
    if (question.systemField !== "farm.town") return options as InstrumentOption[];
    if (!selectedDepartmentId) return options as InstrumentOption[];
    return (options as InstrumentOption[]).filter((o) => o.departmentId === selectedDepartmentId);
  }, [question.systemField, options, selectedDepartmentId]);

  if (!type) {
    return (
      <OpenTextInput
        questionId={questionId}
        value={answer?.textValue}
        onChange={onChange}
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

    case "yes_no": {
      const YES_NO_OPTIONS = [
        { optionId: "yes", text: "Sí", value: 1, isOther: false },
        { optionId: "no", text: "No", value: 0, isOther: false },
      ];
      const selectedId = answer?.booleanValue === true
        ? "yes"
        : answer?.booleanValue === false
          ? "no"
          : undefined;
      return (
        <SingleChoiceList
          questionId={questionId}
          options={YES_NO_OPTIONS}
          value={selectedId}
          onChange={(a) =>
            onChange({
              questionId,
              booleanValue: a.optionId === "yes",
            })
          }
        />
      );
    }

    case "single_choice":
      return (
        <SingleChoiceList
          questionId={questionId}
          options={displayOptions}
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
