import React, { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useInstrumentSurveyStore } from "../../../../src/store/useInstrumentSurveyStore";
import QuestionScreen from "../../../../src/components/instrument/QuestionScreen";

export default function QuestionRoute() {
  const { id, index } = useLocalSearchParams<{ id: string; index: string }>();
  const router = useRouter();
  const goToIndex = useInstrumentSurveyStore((s) => s.goToIndex);
  const visibleQuestions = useInstrumentSurveyStore((s) => s.visibleQuestions);
  const activeInstrumentId = useInstrumentSurveyStore((s) => s.instrumentId);

  useEffect(() => {
    // Defensive guard (spec 23): a stale question screen from an instrument
    // already finished can still be reached via the native back button if
    // some other navigation path forgot to clean up history. When that
    // happens the global survey store no longer matches this route's
    // instrumentId — bail out to the campaigns tab instead of letting
    // goToIndex/visibleQuestions run against the wrong instrument's data
    // and fall into "No hay preguntas disponibles" with no way out.
    if (activeInstrumentId !== id) {
      router.replace("/(tabs)/campaign");
      return;
    }

    const idx = parseInt(index ?? "0", 10);
    const visible = visibleQuestions();
    const safeIdx = Number.isNaN(idx)
      ? 0
      : Math.max(0, Math.min(idx, visible.length - 1));
    goToIndex(safeIdx);
  }, [index, activeInstrumentId, id]);

  const handleFinished = () => {
    router.push(`/instrument/${id}/review`);
  };

  return <QuestionScreen instrumentId={id ?? ""} onFinished={handleFinished} />;
}
