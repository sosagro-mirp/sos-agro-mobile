import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Save, LoaderCircle } from 'lucide-react-native';
import { useSnackbar } from '../common/Snackbar';
import { changeRequestStorage } from '../../storage/changeRequestStorage';
import { useChangeRequestStore } from '../../store/useChangeRequestStore';
import { Fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../theme/colors';
import { generateUUID } from '../../lib/generateLocalId';
import { SyncQueueService } from '../../sync/SyncQueueService';
import { logger } from '../../lib/logger';

const MAX_LENGTH = 2000;
const MIN_LENGTH = 10;

interface Props {
  farmerId?: string;
  farmerName?: string;
  onSubmitted?: () => void;
}

export const ChangeRequestForm: React.FC<Props> = ({ farmerId, farmerName, onSubmitted }) => {
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const addRequest = useChangeRequestStore((s) => s.addRequest);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show: showSnackbar } = useSnackbar();

  const trimmedLength = description.trim().length;
  const canSubmit = trimmedLength >= MIN_LENGTH && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const trimmed = description.trim();

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
      showSnackbar({ message: 'Solicitud guardada. Se enviará al servidor cuando haya conexión.', variant: 'success' });
      onSubmitted?.();
      SyncQueueService.processAll().catch((err) =>
        logger.error('[ChangeRequestForm] processAll failed', err),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Reportar problema</Text>

      {farmerName && (
        <Text style={styles.farmerLabel}>Agricultor: {farmerName}</Text>
      )}

      <TextInput
        style={styles.input}
        placeholder="Describe el problema o dato incorrecto..."
        placeholderTextColor={colors.textMuted}
        multiline
        numberOfLines={5}
        value={description}
        onChangeText={setDescription}
        maxLength={MAX_LENGTH}
        textAlignVertical="top"
      />
      <View style={styles.counterRow}>
        <Text style={styles.minHint}>Mínimo {MIN_LENGTH} caracteres</Text>
        <Text style={styles.counter}>{description.length} / {MAX_LENGTH}</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        accessibilityRole="button"
      >
        {saving ? (
          <LoaderCircle size={17} color={colors.brandForeground} />
        ) : (
          <>
            <Save size={17} color={colors.brandForeground} strokeWidth={2.2} />
            <Text style={styles.buttonText}>Guardar solicitud</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 9,
    },
    title: {
      fontFamily: Fonts.extraBold,
      fontSize: 19,
      color: colors.textPrimary,
      letterSpacing: -0.3,
      marginBottom: 5,
    },
    farmerLabel: {
      fontFamily: Fonts.regular,
      fontSize: 13,
      color: colors.textMuted,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 13,
      backgroundColor: colors.surfaceMuted,
      fontFamily: Fonts.regular,
      fontSize: 13.5,
      color: colors.textPrimary,
      lineHeight: 20,
      minHeight: 100,
    },
    counterRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 5,
    },
    minHint: { fontFamily: Fonts.regular, fontSize: 10.5, color: colors.textMuted },
    counter: { fontFamily: Fonts.bold, fontSize: 10.5, color: colors.textMuted },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      backgroundColor: colors.brand,
      borderRadius: 11,
      paddingVertical: 16,
    },
    buttonDisabled: { backgroundColor: colors.textMuted },
    buttonText: {
      fontSize: 14.5,
      fontFamily: Fonts.extraBold,
      color: colors.brandForeground,
    },
  });
}
