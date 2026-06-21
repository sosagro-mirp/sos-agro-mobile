import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { PrimaryButton } from '../common/PrimaryButton';
import { changeRequestStorage } from '../../storage/changeRequestStorage';
import { useChangeRequestStore } from '../../store/useChangeRequestStore';
import { Fonts } from '../../theme/fonts';
import { generateUUID } from '../../lib/generateLocalId';

interface Props {
  farmerId?: string;
  farmerName?: string;
  onSubmitted?: () => void;
}

export const ChangeRequestForm: React.FC<Props> = ({ farmerId, farmerName, onSubmitted }) => {
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const addRequest = useChangeRequestStore((s) => s.addRequest);

  const handleSubmit = async () => {
    const trimmed = description.trim();
    if (trimmed.length < 10) {
      Alert.alert('Descripción muy corta', 'Escribe al menos 10 caracteres describiendo el problema.');
      return;
    }

    setSaving(true);
    try {
      const id = generateUUID();
      const entry = {
        id,
        description: trimmed,
        farmerId,
        createdAt: new Date(),
      };

      await changeRequestStorage.create(entry);
      addRequest({ ...entry, status: 'pending_sync' });

      setDescription('');
      onSubmitted?.();
      Alert.alert('Solicitud guardada', 'Se enviará al servidor cuando haya conexión.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reportar problema</Text>

      {farmerName && (
        <Text style={styles.farmerLabel}>Agricultor: {farmerName}</Text>
      )}

      <TextInput
        style={styles.input}
        placeholder="Describe el problema o dato incorrecto..."
        placeholderTextColor="#9CA3AF"
        multiline
        numberOfLines={5}
        value={description}
        onChangeText={setDescription}
        maxLength={2000}
        textAlignVertical="top"
      />
      <Text style={styles.counter}>{description.length}/2000</Text>

      {saving ? (
        <ActivityIndicator color="#1B6B3A" />
      ) : (
        <PrimaryButton
          label="Guardar solicitud"
          onPress={handleSubmit}
          disabled={description.trim().length < 10}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
    padding: 16,
  },
  title: {
    fontFamily: Fonts.semiBold,
    fontSize: 18,
    color: '#111827',
  },
  farmerLabel: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: '#6B7280',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontFamily: Fonts.regular,
    fontSize: 15,
    color: '#111827',
    minHeight: 120,
  },
  counter: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'right',
  },
});
