import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import type { InstrumentDraftAnswer } from '../../types/instrument';

interface Props {
  questionId: string;
  value: string | undefined;
  filename?: string;
  onChange: (answer: InstrumentDraftAnswer) => void;
}

const DOCS_DIR = `${FileSystem.documentDirectory}media/docs/`;

export function DocumentPickerInput({ questionId, value, filename, onChange }: Props): React.JSX.Element {
  const [localUri, setLocalUri] = useState<string | undefined>(value);
  const [localFilename, setLocalFilename] = useState<string | undefined>(filename);

  async function pickDocument(): Promise<void> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      await FileSystem.makeDirectoryAsync(DOCS_DIR, { intermediates: true });
      const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const dest = `${DOCS_DIR}${questionId}-${Date.now()}-${safeName}`;
      await FileSystem.copyAsync({ from: asset.uri, to: dest });

      setLocalUri(dest);
      setLocalFilename(asset.name);
      onChange({ questionId, mediaLocalPath: dest, mimeType: 'application/pdf' });
    } catch {
      Alert.alert('Error', 'No se pudo seleccionar el documento.');
    }
  }

  function removeDocument(): void {
    setLocalUri(undefined);
    setLocalFilename(undefined);
    onChange({ questionId, mediaLocalPath: undefined, mimeType: undefined });
  }

  if (localUri) {
    return (
      <View style={styles.container}>
        <View style={styles.fileCard}>
          <Text style={styles.fileIcon}>📄</Text>
          <Text style={styles.filename} numberOfLines={2}>{localFilename ?? 'documento.pdf'}</Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={pickDocument}>
            <Text style={styles.secondaryButtonText}>📂 Reemplazar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={removeDocument}>
            <Text style={[styles.secondaryButtonText, styles.deleteText]}>✕ Eliminar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.primaryButton} onPress={pickDocument}>
        <Text style={styles.buttonIcon}>📂</Text>
        <Text style={styles.primaryButtonText}>Seleccionar PDF</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 12 },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1B6B3A',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  fileIcon: { fontSize: 28 },
  filename: { flex: 1, fontSize: 14, color: '#111827' },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B6B3A',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 10,
  },
  buttonIcon: { fontSize: 22 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10 },
  secondaryButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: { fontSize: 14, color: '#374151' },
  deleteText: { color: '#DC2626' },
});
