import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Mic, Square, Play, Trash2, Check } from 'lucide-react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../theme/colors';
import type { InstrumentDraftAnswer } from '../../types/instrument';

interface Props {
  questionId: string;
  value: string | undefined;
  onChange: (answer: InstrumentDraftAnswer) => void;
}

type RecordingState = 'idle' | 'recording' | 'recorded';

const VOICE_DIR = `${FileSystem.documentDirectory}media/voice/`;

// Field recordings on a spotty connection can otherwise grow unboundedly;
// cap at 5 minutes so a single answer never blocks the sync queue with a
// huge upload.
const MAX_DURATION_SECONDS = 300;

export function VoiceRecordingInput({ questionId, value, onChange }: Props): React.JSX.Element {
  const [state, setState] = useState<RecordingState>(value ? 'recorded' : 'idle');
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const autoStoppedRef = useRef(false);
  const isRecordingRef = useRef(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 500);
  const duration = Math.floor(recorderState.durationMillis / 1000);

  const player = useAudioPlayer(value ? { uri: value } : null);

  // Read by the unmount-only cleanup effect below, which must always act on
  // the latest recorder instance without re-running (and prematurely
  // stopping it) whenever this component merely re-renders.
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  useEffect(() => {
    isRecordingRef.current = recorderState.isRecording;
  }, [recorderState.isRecording]);

  // useAudioPlayer only loads the source it was created with — it doesn't
  // reload when `value` changes on a later render, so a re-record has to
  // replace it manually. Skipped when `value` clears (delete): the native
  // module rejects `replace(null)` at runtime even though `useAudioPlayer`
  // itself accepts a null source. Leaving the previous source loaded is
  // harmless here since playback controls aren't rendered outside the
  // `recorded` state, and the next real recording will replace it correctly.
  useEffect(() => {
    if (!value) return;
    player.replace({ uri: value });
  }, [value, player]);

  useEffect(() => {
    return () => {
      // No manual player.remove() here: useAudioPlayer/useAudioRecorder are
      // both built on useReleasingSharedObject, which already releases the
      // native instance on unmount. Calling .remove() again ourselves raced
      // that internal cleanup and crashed with "shared object already
      // released". Stopping an in-flight recording is a different action
      // (not a release) and doesn't conflict with it.
      if (isRecordingRef.current) {
        recorderRef.current.stop().catch(() => {});
      }
    };
    // Intentionally empty: this must run its cleanup exactly once, on true
    // unmount — not on every render where `player`/`recorder` happen to get
    // a new identity, which would trigger this early.
  }, []);

  async function finishRecording(): Promise<void> {
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });

    const uri = recorder.uri;
    if (!uri) return;

    await FileSystem.makeDirectoryAsync(VOICE_DIR, { intermediates: true });
    const filename = `${questionId}-${Date.now()}.m4a`;
    const dest = `${VOICE_DIR}${filename}`;
    await FileSystem.copyAsync({ from: uri, to: dest });

    setState('recorded');
    onChange({ questionId, mediaLocalPath: dest, mimeType: 'audio/m4a' });
  }

  // recorderState updates on every polling tick (every 500ms) while
  // recording, so this effect can fire several times before `recorder.stop()`
  // resolves and isRecording flips to false — the ref guards against
  // triggering finishRecording() more than once for the same recording.
  useEffect(() => {
    if (!recorderState.isRecording) return;
    if (duration >= MAX_DURATION_SECONDS && !autoStoppedRef.current) {
      autoStoppedRef.current = true;
      finishRecording().catch(() => {
        Alert.alert('Error', 'No se pudo guardar la grabación.');
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, recorderState.isRecording]);

  async function startRecording(): Promise<void> {
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permiso requerido', 'SOSAgro necesita acceso al micrófono para grabar audio.');
        return;
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

      autoStoppedRef.current = false;
      await recorder.prepareToRecordAsync();
      recorder.record();
      setState('recording');
    } catch {
      Alert.alert('Error', 'No se pudo iniciar la grabación.');
    }
  }

  async function stopRecording(): Promise<void> {
    try {
      await finishRecording();
    } catch {
      Alert.alert('Error', 'No se pudo guardar la grabación.');
    }
  }

  async function playPreview(): Promise<void> {
    if (!value) return;
    try {
      await player.seekTo(0);
      player.play();
    } catch {
      Alert.alert('Error', 'No se pudo reproducir la grabación.');
    }
  }

  function deleteRecording(): void {
    player.pause();
    setState('idle');
    onChange({ questionId, mediaLocalPath: undefined, mimeType: undefined });
  }

  if (state === 'idle') {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.recordButton} onPress={startRecording}>
          <Mic size={22} color={colors.brandForeground} />
          <Text style={styles.recordButtonText}>Iniciar grabación</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state === 'recording') {
    return (
      <View style={styles.container}>
        <View style={styles.recordingBadge}>
          <View style={styles.dot} />
          <Text style={styles.recordingText}>Grabando... {duration}s</Text>
        </View>
        <TouchableOpacity style={[styles.recordButton, styles.stopButton]} onPress={stopRecording}>
          <Square size={22} color={colors.brandForeground} />
          <Text style={styles.recordButtonText}>Detener</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.recordedCard}>
        <Check size={15} color={colors.successFg} strokeWidth={2.6} />
        <Text style={styles.recordedLabel}>Grabación lista</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={playPreview} accessibilityRole="button">
          <Play size={17} color={colors.textPrimary} strokeWidth={2.2} />
          <Text style={styles.secondaryButtonText}>Reproducir</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={deleteRecording}
          accessibilityRole="button"
          accessibilityLabel="Eliminar grabación"
        >
          <Trash2 size={18} color={colors.dangerFg} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { width: '100%', gap: 12 },
    recordButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brand,
      borderRadius: 11,
      paddingVertical: 17,
      gap: 9,
    },
    stopButton: { backgroundColor: colors.dangerFg },
    recordButtonText: { color: colors.brandForeground, fontSize: 15.5, fontWeight: '800' },
    recordingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.dangerFg,
    },
    recordingText: { fontSize: 15, color: colors.dangerFg, fontWeight: '500' },
    recordedCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 11,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 13,
      paddingVertical: 12,
    },
    recordedLabel: { fontSize: 13.5, color: colors.successFg, fontWeight: '700' },
    actions: { flexDirection: 'row', gap: 10 },
    secondaryButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 11,
      paddingVertical: 15,
      gap: 8,
    },
    secondaryButtonText: { fontSize: 13.5, fontWeight: '700', color: colors.textPrimary },
    deleteButton: {
      width: 56,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.dangerFg,
      backgroundColor: colors.dangerBg,
      borderRadius: 11,
    },
  });
}
