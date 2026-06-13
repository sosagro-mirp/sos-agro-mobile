import React, { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useInstrumentSurveyStore } from "../../../../src/store/useInstrumentSurveyStore";
import QuestionScreen from "../../../../src/components/instrument/QuestionScreen";

export default function QuestionRoute() {
  const { id, index } = useLocalSearchParams<{ id: string; index: string }>();
  const router = useRouter();
  const goToIndex = useInstrumentSurveyStore((s) => s.goToIndex);
  const visibleQuestions = useInstrumentSurveyStore((s) => s.visibleQuestions);

  useEffect(() => {
    const idx = parseInt(index ?? "0", 10);
    const visible = visibleQuestions();
    const safeIdx = Number.isNaN(idx)
      ? 0
      : Math.max(0, Math.min(idx, visible.length - 1));
    goToIndex(safeIdx);
  }, [index]);

  const handleFinished = () => {
    router.push(`/instrument/${id}/review`);
  };

  return <QuestionScreen instrumentId={id ?? ""} onFinished={handleFinished} />;
}
