import { useMemo } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../theme/colors';

interface DocumentCollisionModalProps {
  visible: boolean;
  documentId: string;
  existingFarmerName: string;
  submittedName: string;
  isLoading: boolean;
  // Spec 68, Fase 4 — offline solo hay red para "corregir el documento";
  // confirmar que es la misma persona requiere resolverlo contra el
  // backend, así que ese botón se oculta sin conexión.
  allowSamePerson: boolean;
  onCorrectDocument: () => void;
  onSamePerson: () => void;
  onSeparatePerson: () => void;
  // TC-068-09 (@reviewer, docs/reports/auditorias/24-auditoria-mobile-spec68.md):
  // sin `onRequestClose`, Android captura el botón "atrás" del sistema sin
  // hacer nada mientras el modal está visible — pantalla muerta. No hay
  // botón "Cancelar" (no está en la tabla de acciones del spec), pero el
  // botón físico de Android sí debe salir; la colisión sigue sin resolver
  // en el backend y vuelve a aparecer al reingresar (ver Fase 3 del spec).
  onRequestClose: () => void;
}

export function DocumentCollisionModal({
  visible,
  documentId,
  existingFarmerName,
  submittedName,
  isLoading,
  allowSamePerson,
  onCorrectDocument,
  onSamePerson,
  onSeparatePerson,
  onRequestClose,
}: DocumentCollisionModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Documento ya registrado</Text>
          <Text style={styles.body}>
            El documento <Text style={styles.bold}>{documentId}</Text> ya está registrado a nombre
            de <Text style={styles.bold}>{existingFarmerName}</Text>, pero acabas de digitar{' '}
            <Text style={styles.bold}>{submittedName}</Text>. ¿Qué deseas hacer?
          </Text>

          {isLoading ? (
            <ActivityIndicator size="large" color={colors.brand} style={styles.spinner} />
          ) : (
            <>
              <Pressable style={[styles.button, styles.primary]} onPress={onCorrectDocument}>
                <Text style={[styles.buttonText, styles.primaryText]}>Corregir el documento</Text>
              </Pressable>

              {allowSamePerson ? (
                <Pressable style={[styles.button, styles.secondary]} onPress={onSamePerson}>
                  <Text style={[styles.buttonText, styles.secondaryText]}>Es la misma persona</Text>
                </Pressable>
              ) : null}

              <Pressable style={[styles.button, styles.secondary]} onPress={onSeparatePerson}>
                <Text style={[styles.buttonText, styles.secondaryText]}>Registrar aparte</Text>
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
    primary: { backgroundColor: colors.brand },
    secondary: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
    buttonText: { fontSize: 15, fontFamily: Fonts.semiBold, color: colors.brandForeground },
    primaryText: { color: colors.brandForeground },
    secondaryText: { color: colors.textPrimary },
  });
}
