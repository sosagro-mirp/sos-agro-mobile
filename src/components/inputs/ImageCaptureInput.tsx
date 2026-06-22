import React, { useState } from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { InstrumentDraftAnswer } from '../../types/instrument';

interface Props {
  questionId: string;
  value: string | undefined;
  onChange: (answer: InstrumentDraftAnswer) => void;
}

const IMAGES_DIR = `${FileSystem.documentDirectory}media/images/`;

export function ImageCaptureInput({ questionId, value, onChange }: Props): React.JSX.Element {
  const [localUri, setLocalUri] = useState<string | undefined>(value);

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
      await saveImage(result.assets[0].uri);
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
      await saveImage(result.assets[0].uri);
    }
  }

  async function saveImage(uri: string): Promise<void> {
    try {
      await FileSystem.makeDirectoryAsync(IMAGES_DIR, { intermediates: true });
      const ext = uri.split('.').pop() ?? 'jpg';
      const filename = `${questionId}-${Date.now()}.${ext}`;
      const dest = `${IMAGES_DIR}${filename}`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      setLocalUri(dest);
      onChange({ questionId, mediaLocalPath: dest, mimeType: 'image/jpeg' });
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
            <Text style={styles.secondaryButtonText}>📷 Reemplazar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={removeImage}>
            <Text style={[styles.secondaryButtonText, styles.deleteText]}>✕ Eliminar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.primaryButton} onPress={pickFromCamera}>
        <Text style={styles.buttonIcon}>📷</Text>
        <Text style={styles.primaryButtonText}>Tomar foto</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={pickFromGallery}>
        <Text style={styles.secondaryButtonText}>🖼 Elegir de galería</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 12 },
  preview: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
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
