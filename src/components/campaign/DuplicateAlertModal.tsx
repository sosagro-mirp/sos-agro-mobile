import { useMemo } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../theme/colors';

interface DuplicateAlertModalProps {
  visible: boolean;
  instrumentName: string;
  isLoading: boolean;
  onOverwrite: () => void;
  onSkip: () => void;
  onCancel: () => void;
}

export function DuplicateAlertModal({
  visible,
  instrumentName,
  isLoading,
  onOverwrite,
  onSkip,
  onCancel,
}: DuplicateAlertModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Encuesta duplicada</Text>
          <Text style={styles.body}>
            Ya existe una encuesta de{' '}
            <Text style={styles.bold}>{instrumentName}</Text>{' '}
            para este agricultor. ¿Qué deseas hacer?
          </Text>

          {isLoading ? (
            <ActivityIndicator size="large" color={colors.brand} style={styles.spinner} />
          ) : (
            <>
              <Pressable style={[styles.button, styles.destructive]} onPress={onOverwrite}>
                <Text style={styles.buttonText}>Sobrescribir respuestas</Text>
              </Pressable>

              <Pressable style={[styles.button, styles.primary]} onPress={onSkip}>
                <Text style={[styles.buttonText, styles.primaryText]}>Pasar a la siguiente encuesta</Text>
              </Pressable>

              <Pressable style={[styles.button, styles.secondary]} onPress={onCancel}>
                <Text style={[styles.buttonText, styles.secondaryText]}>Cancelar</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    card: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 24,
      gap: 12,
    },
    title: { fontSize: 18, fontFamily: Fonts.bold, color: colors.textPrimary },
    body: { fontSize: 15, fontFamily: Fonts.regular, color: colors.textPrimary, lineHeight: 22 },
    bold: { fontFamily: Fonts.semiBold },
    spinner: { marginVertical: 16 },
    button: {
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
    },
    destructive: { backgroundColor: colors.dangerFg },
    primary: { backgroundColor: colors.brand },
    secondary: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
    buttonText: { fontSize: 15, fontFamily: Fonts.semiBold, color: colors.brandForeground },
    primaryText: { color: colors.brandForeground },
    secondaryText: { color: colors.textPrimary },
  });
}
