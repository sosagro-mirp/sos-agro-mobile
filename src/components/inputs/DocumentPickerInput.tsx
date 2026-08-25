import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FolderOpen, FileText, Trash2 } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useSnackbar } from '../common/Snackbar';
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
  const { show: showSnackbar } = useSnackbar();

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
      showSnackbar({ message: 'No se pudo seleccionar el documento.', variant: 'error' });
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
          <FileText size={26} color={colors.brand} strokeWidth={2} />
          <Text style={styles.filename} numberOfLines={2}>{localFilename ?? 'documento.pdf'}</Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={pickDocument} accessibilityRole="button">
            <FolderOpen size={17} color={colors.textPrimary} strokeWidth={2.2} />
            <Text style={styles.secondaryButtonText}>Reemplazar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={removeDocument}
            accessibilityRole="button"
            accessibilityLabel="Eliminar documento"
          >
            <Trash2 size={18} color={colors.dangerFg} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.primaryButton} onPress={pickDocument} accessibilityRole="button">
        <FolderOpen size={22} color={colors.brandForeground} strokeWidth={2.2} />
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
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 11,
      backgroundColor: colors.surfaceMuted,
      padding: 14,
      gap: 12,
    },
    filename: { flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.textPrimary },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brand,
      borderRadius: 11,
      paddingVertical: 17,
      gap: 9,
    },
    primaryButtonText: { color: colors.brandForeground, fontSize: 15.5, fontWeight: '800' },
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
