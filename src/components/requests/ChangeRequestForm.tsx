import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { PrimaryButton } from '../common/PrimaryButton';
import { changeRequestStorage } from '../../storage/changeRequestStorage';
import { useChangeRequestStore } from '../../store/useChangeRequestStore';
import { Fonts } from '../../theme/fonts';
import { generateUUID } from '../../lib/generateLocalId';
import { SyncQueueService } from '../../sync/SyncQueueService';

interface Props {
  farmerId?: string;
  farmerName?: string;
  onSubmitted?: () => void;
}

export const ChangeRequestForm: React.FC<Props> = ({ farmerId, farmerName, onSubmitted }) => {
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
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
      setShowSuccess(true);
      SyncQueueService.processAll().catch(console.error);
    } finally {
      setSaving(false);
    }
  };

  const handleSuccessDismiss = () => {
    setShowSuccess(false);
    onSubmitted?.();
  };

  return (
    <View style={styles.container}>
      <Modal
        visible={showSuccess}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Solicitud guardada</Text>
            <Text style={styles.modalBody}>
              Se enviará al servidor cuando haya conexión.
            </Text>
            <Pressable style={styles.modalButton} onPress={handleSuccessDismiss}>
              <Text style={styles.modalButtonText}>Entendido</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: '#111827',
  },
  modalBody: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: '#374151',
    lineHeight: 22,
  },
  modalButton: {
    backgroundColor: '#1B6B3A',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  modalButtonText: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: '#fff',
  },
});
