import React, { useMemo, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, Images, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
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

  async function pickFromCamera(): Promise<void> {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      Alert.alert('Permiso requerido', 'SOSAgro necesita acceso a la cámara para tomar fotos.');
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
      Alert.alert('Permiso requerido', 'SOSAgro necesita acceso a tu galería para adjuntar imágenes.');
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
      Alert.alert('Error', 'No se pudo guardar la imagen.');
    }
  }

  function removeImage(): void {
    setLocalUri(undefined);
    onChange({ questionId, mediaLocalPath: undefined, mimeType: undefined });
  }

  if (localUri) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: localUri }} style={styles.preview} resizeMode="cover" />
        <View style={styles.actions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={pickFromCamera}>
            <Camera size={16} color={colors.textPrimary} />
            <Text style={styles.secondaryButtonText}>Reemplazar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={removeImage}>
            <X size={16} color={colors.dangerFg} />
            <Text style={[styles.secondaryButtonText, styles.deleteText]}>Eliminar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.primaryButton} onPress={pickFromCamera}>
        <Camera size={22} color={colors.brandForeground} />
        <Text style={styles.primaryButtonText}>Tomar foto</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={pickFromGallery}>
        <Images size={16} color={colors.textPrimary} />
        <Text style={styles.secondaryButtonText}>Elegir de galería</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { width: '100%', gap: 12 },
    preview: {
      width: '100%',
      height: 220,
      borderRadius: 12,
      backgroundColor: colors.surfaceMuted,
    },
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
