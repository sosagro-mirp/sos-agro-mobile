import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Mic, Square, Play, X } from 'lucide-react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
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
  const autoStoppedRef = useRef(false);
  const isRecordingRef = useRef(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 500);
  const duration = Math.floor(recorderState.durationMillis / 1000);

  const player = useAudioPlayer(value ? { uri: value } : null);

  useEffect(() => {
    isRecordingRef.current = recorderState.isRecording;
  }, [recorderState.isRecording]);

  // useAudioPlayer only loads the source it was created with — it doesn't
  // reload when `value` changes on a later render, so the source has to be
  // swapped manually to follow a re-record or a delete (value -> undefined).
  useEffect(() => {
    player.replace(value ? { uri: value } : null);
  }, [value, player]);

  useEffect(() => {
    return () => {
      player.remove();
      if (isRecordingRef.current) {
        recorder.stop().catch(() => {});
      }
    };
  }, [player, recorder]);

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
          <Mic size={22} color="#FFFFFF" />
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
          <Square size={22} color="#FFFFFF" />
          <Text style={styles.recordButtonText}>Detener</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.recordedCard}>
        <Text style={styles.recordedLabel}>Grabación lista</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={playPreview}>
            <Play size={16} color="#374151" />
            <Text style={styles.secondaryButtonText}>Reproducir</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={deleteRecording}>
            <X size={16} color="#DC2626" />
            <Text style={[styles.secondaryButtonText, styles.deleteText]}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 12 },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B6B3A',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 10,
  },
  stopButton: { backgroundColor: '#DC2626' },
  recordButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
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
    backgroundColor: '#DC2626',
  },
  recordingText: { fontSize: 15, color: '#DC2626', fontWeight: '500' },
  recordedCard: {
    borderWidth: 2,
    borderColor: '#1B6B3A',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  recordedLabel: { fontSize: 15, color: '#1B6B3A', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10 },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 10,
    gap: 6,
  },
  secondaryButtonText: { fontSize: 14, color: '#374151' },
  deleteText: { color: '#DC2626' },
});
