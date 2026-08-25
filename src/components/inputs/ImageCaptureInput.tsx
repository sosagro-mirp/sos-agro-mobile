import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, Images, Trash2, Check, ImageIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useSnackbar } from '../common/Snackbar';
import { useTheme } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../theme/colors';
import type { InstrumentDraftAnswer } from '../../types/instrument';

interface Props {
  questionId: string;
  value: string | undefined;
  onChange: (answer: InstrumentDraftAnswer) => void;
}

const IMAGES_DIR = `${FileSystem.documentDirectory}media/images/`;

const EXTENSION_MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
  gif: 'image/gif',
};

// Fallback for when ImagePicker doesn't report a mimeType (older platforms).
function mimeTypeFromExtension(ext: string): string {
  return EXTENSION_MIME_TYPES[ext.toLowerCase()] ?? 'image/jpeg';
}

export function ImageCaptureInput({ questionId, value, onChange }: Props): React.JSX.Element {
  const [localUri, setLocalUri] = useState<string | undefined>(value);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show: showSnackbar } = useSnackbar();

  async function pickFromCamera(): Promise<void> {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      showSnackbar({ message: 'SOSAgro necesita acceso a la cámara para tomar fotos.', variant: 'error' });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.85,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      await saveImage(result.assets[0].uri, result.assets[0].mimeType);
    }
  }

  async function pickFromGallery(): Promise<void> {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      showSnackbar({ message: 'SOSAgro necesita acceso a tu galería para adjuntar imágenes.', variant: 'error' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.85,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      await saveImage(result.assets[0].uri, result.assets[0].mimeType);
    }
  }

  async function saveImage(uri: string, pickedMimeType: string | undefined): Promise<void> {
    try {
      await FileSystem.makeDirectoryAsync(IMAGES_DIR, { intermediates: true });
      const ext = uri.split('.').pop() ?? 'jpg';
      const filename = `${questionId}-${Date.now()}.${ext}`;
      const dest = `${IMAGES_DIR}${filename}`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      setLocalUri(dest);
      onChange({
        questionId,
        mediaLocalPath: dest,
        mimeType: pickedMimeType ?? mimeTypeFromExtension(ext),
      });
    } catch {
      showSnackbar({ message: 'No se pudo guardar la imagen.', variant: 'error' });
    }
  }

  function removeImage(): void {
    setLocalUri(undefined);
    onChange({ questionId, mediaLocalPath: undefined, mimeType: undefined });
  }

  if (localUri) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Image source={{ uri: localUri }} style={styles.preview} resizeMode="cover" />
          <View style={styles.savedFooter}>
            <Check size={15} color={colors.successFg} strokeWidth={2.6} />
            <Text style={styles.savedFooterText}>Guardada en el dispositivo</Text>
            <Text style={styles.savedFooterHint}>Sube al sincronizar</Text>
          </View>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.replaceButton} onPress={pickFromCamera} accessibilityRole="button">
            <Camera size={17} color={colors.textPrimary} strokeWidth={2.2} />
            <Text style={styles.replaceButtonText}>Reemplazar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={removeImage}
            accessibilityRole="button"
            accessibilityLabel="Eliminar foto"
          >
            <Trash2 size={18} color={colors.dangerFg} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.emptyCard}>
        <ImageIcon size={34} color={colors.textMuted} strokeWidth={1.6} />
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={pickFromCamera} accessibilityRole="button">
        <Camera size={22} color={colors.brandForeground} strokeWidth={2.2} />
        <Text style={styles.primaryButtonText}>Tomar foto</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.replaceButton} onPress={pickFromGallery} accessibilityRole="button">
        <Images size={17} color={colors.textPrimary} strokeWidth={2.2} />
        <Text style={styles.replaceButtonText}>Elegir de galería</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { width: '100%', gap: 10 },
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
    },
    preview: {
      width: '100%',
      height: 220,
      backgroundColor: colors.surfaceMuted,
    },
    savedFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingHorizontal: 13,
      paddingVertical: 11,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    savedFooterText: { flex: 1, fontSize: 11.5, fontWeight: '600', color: colors.successFg },
    savedFooterHint: { fontSize: 10.5, color: colors.textMuted },
    emptyCard: {
      height: 220,
      borderRadius: 12,
      backgroundColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
    replaceButton: {
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
    replaceButtonText: { fontSize: 13.5, fontWeight: '700', color: colors.textPrimary },
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
