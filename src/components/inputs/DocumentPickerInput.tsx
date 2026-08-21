import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FolderOpen, FileText, X } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../theme/colors';
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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
          <FileText size={28} color={colors.brand} />
          <Text style={styles.filename} numberOfLines={2}>{localFilename ?? 'documento.pdf'}</Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={pickDocument}>
            <FolderOpen size={16} color={colors.textPrimary} />
            <Text style={styles.secondaryButtonText}>Reemplazar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={removeDocument}>
            <X size={16} color={colors.dangerFg} />
            <Text style={[styles.secondaryButtonText, styles.deleteText]}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.primaryButton} onPress={pickDocument}>
        <FolderOpen size={22} color={colors.brandForeground} />
        <Text style={styles.primaryButtonText}>Seleccionar PDF</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { width: '100%', gap: 12 },
    fileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.brand,
      borderRadius: 12,
      padding: 16,
      gap: 12,
    },
    filename: { flex: 1, fontSize: 14, color: colors.textPrimary },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brand,
      borderRadius: 12,
      paddingVertical: 16,
      gap: 10,
    },
    primaryButtonText: { color: colors.brandForeground, fontSize: 16, fontWeight: '600' },
    actions: { flexDirection: 'row', gap: 10 },
    secondaryButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      paddingVertical: 12,
      gap: 6,
    },
    secondaryButtonText: { fontSize: 14, color: colors.textPrimary },
    deleteText: { color: colors.dangerFg },
  });
}
