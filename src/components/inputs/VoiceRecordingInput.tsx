import React, { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Mic, Square, Play, X } from 'lucide-react-native';
// DEBT: expo-av is deprecated as of Expo 54; migrate to expo-audio
// (useAudioRecorder/useAudioPlayer) in a maintenance cycle with real-device
// testing — recording/playback isn't safely verifiable from this session.
// See docs/reports/auditorias/05-auditoria-mobile-development.md.
import { Audio } from 'expo-av';
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
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [duration, setDuration] = useState(0);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const autoStoppedRef = useRef(false);

  async function startRecording(): Promise<void> {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permiso requerido', 'SOSAgro necesita acceso al micrófono para grabar audio.');
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      autoStoppedRef.current = false;
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        (status) => {
          if (!status.isRecording) return;
          const seconds = Math.floor((status.durationMillis ?? 0) / 1000);
          setDuration(seconds);
          if (seconds >= MAX_DURATION_SECONDS && !autoStoppedRef.current) {
            autoStoppedRef.current = true;
            // Use `rec` directly instead of the `recording` state: this
            // callback closes over the render where createAsync was called,
            // before setRecording(rec) below ever runs.
            finishRecording(rec).catch(() => {
              Alert.alert('Error', 'No se pudo guardar la grabación.');
            });
          }
        },
      );

      setRecording(rec);
      setState('recording');
    } catch {
      Alert.alert('Error', 'No se pudo iniciar la grabación.');
    }
  }

  async function finishRecording(rec: Audio.Recording): Promise<void> {
    await rec.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

    const uri = rec.getURI();
    if (!uri) return;

    await FileSystem.makeDirectoryAsync(VOICE_DIR, { intermediates: true });
    const filename = `${questionId}-${Date.now()}.m4a`;
    const dest = `${VOICE_DIR}${filename}`;
    await FileSystem.copyAsync({ from: uri, to: dest });

    setRecording(null);
    setState('recorded');
    onChange({ questionId, mediaLocalPath: dest, mimeType: 'audio/m4a' });
  }

  async function stopRecording(): Promise<void> {
    if (!recording) return;
    try {
      await finishRecording(recording);
    } catch {
      Alert.alert('Error', 'No se pudo guardar la grabación.');
    }
  }

  async function playPreview(): Promise<void> {
    if (!value) return;
    try {
      if (sound) {
        await sound.replayAsync();
        return;
      }
      const { sound: s } = await Audio.Sound.createAsync({ uri: value });
      setSound(s);
      await s.playAsync();
    } catch {
      Alert.alert('Error', 'No se pudo reproducir la grabación.');
    }
  }

  function deleteRecording(): void {
    if (sound) {
      sound.unloadAsync();
      setSound(null);
    }
    setState('idle');
    setDuration(0);
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
