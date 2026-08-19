import React, { useCallback } from "react";
import { BackHandler } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useInstrumentSurveyStore } from "../../../../src/store/useInstrumentSurveyStore";
import QuestionScreen from "../../../../src/components/instrument/QuestionScreen";

export default function QuestionRoute() {
  const { id, index } = useLocalSearchParams<{ id: string; index: string }>();
  const router = useRouter();
  const goToIndex = useInstrumentSurveyStore((s) => s.goToIndex);
  const visibleQuestions = useInstrumentSurveyStore((s) => s.visibleQuestions);

  useFocusEffect(
    useCallback(() => {
      // Defensive guard (spec 23, Fase 6): read instrumentId via getState()
      // instead of subscribing to it, and gate the guard on focus. This repo
      // has no freezeOnBlur/enableFreeze, so every question screen ever
      // pushed stays mounted (just unfocused) below the active one. The
      // original version subscribed to `instrumentId` in a plain useEffect,
      // so completed.tsx's reset() (which clears instrumentId) re-ran this
      // guard on every stale, unfocused question screen at once — each one
      // raced to router.replace("/(tabs)/campaign") and hijacked the
      // navigation queue ahead of the real advanceWithinCampaign() push,
      // sending the user to the campaigns tab instead of the next
      // instrument. useFocusEffect only invokes the callback while this
      // screen is actually focused, so a reset() while unfocused is a no-op
      // here — the guard still catches the real case (returning via native
      // "Atrás" to a stale, now-focused screen).
      const activeInstrumentId = useInstrumentSurveyStore.getState().instrumentId;
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
    }, [index, id, goToIndex, visibleQuestions, router]),
  );

  // Con la navegación por `replace` (ver QuestionScreen.handleNext) ya no hay
  // preguntas anteriores en el stack, así que el botón físico «Atrás» saldría
  // del instrumento hacia la pantalla «Comenzar» — donde volver a pulsar
  // crearía un borrador nuevo. Se intercepta para que retroceda de pregunta,
  // igual que hacía antes con el stack. En la primera pregunta no se
  // intercepta: sale del instrumento, que es el comportamiento de siempre.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        const { currentIndex, goToPrev } = useInstrumentSurveyStore.getState();
        if (currentIndex <= 0) return false;
        goToPrev();
        router.replace(`/instrument/${id}/question/${currentIndex - 1}`);
        return true;
      });
      return () => sub.remove();
    }, [id, router]),
  );

  const handleFinished = () => {
    router.push(`/instrument/${id}/review`);
  };

  return <QuestionScreen instrumentId={id ?? ""} onFinished={handleFinished} />;
}
