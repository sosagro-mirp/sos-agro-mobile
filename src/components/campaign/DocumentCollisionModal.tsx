import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { UserX, WifiOff, LoaderCircle } from 'lucide-react-native';
import { AppText } from '../common/AppText';
import { Fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../theme/colors';

interface DocumentCollisionModalProps {
  visible: boolean;
  documentId: string;
  existingFarmerName: string;
  submittedName: string;
  isLoading: boolean;
  // Spec 68, Fase 4 — offline solo hay red para "corregir el documento":
  // confirmar que es la misma persona requiere resolverlo contra el
  // backend. Spec 74, Fase 6 (Decisión pendiente #3, 2026-08-25): antes ese
  // botón se ocultaba del todo sin conexión; ahora se ve siempre pero
  // deshabilitado con la etiqueta REQUIERE CONEXIÓN, siguiendo el mockup.
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
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.iconWrapper}>
              <UserX size={22} color={colors.warningFg} strokeWidth={2.2} />
            </View>
            <View style={styles.headerText}>
              <AppText style={styles.title}>Ese documento ya está registrado</AppText>
              <AppText style={styles.body}>
                El documento <Text style={styles.bold}>{documentId}</Text> pertenece a otra
                persona en el sistema.
              </AppText>
            </View>
          </View>

          <View style={styles.compareBox}>
            <View style={styles.compareRow}>
              <Text style={styles.compareLabel}>EN EL SISTEMA</Text>
              <Text style={styles.compareValue} numberOfLines={1}>{existingFarmerName}</Text>
            </View>
            <View style={styles.compareRow}>
              <Text style={styles.compareLabel}>ESTÁS REGISTRANDO</Text>
              <Text style={styles.compareValue} numberOfLines={1}>{submittedName}</Text>
            </View>
          </View>

          {isLoading ? (
            <LoaderCircle size={28} color={colors.brand} style={styles.spinner} />
          ) : (
            <View style={styles.actions}>
              <Pressable style={styles.buttonPrimary} onPress={onCorrectDocument} accessibilityRole="button">
                <AppText style={styles.buttonPrimaryText}>Corregir el documento</AppText>
              </Pressable>

              <Pressable style={styles.buttonSecondary} onPress={onSeparatePerson} accessibilityRole="button">
                <AppText style={styles.buttonSecondaryText}>Registrar aparte</AppText>
              </Pressable>

              <Pressable
                style={[styles.samePersonRow, !allowSamePerson && styles.samePersonRowDisabled]}
                onPress={allowSamePerson ? onSamePerson : undefined}
                disabled={!allowSamePerson}
                accessibilityRole="button"
                accessibilityState={{ disabled: !allowSamePerson }}
              >
                <AppText style={styles.samePersonText}>Es la misma persona</AppText>
                {!allowSamePerson ? (
                  <View style={styles.samePersonBadge}>
                    <WifiOff size={13} color={colors.textMuted} strokeWidth={2.4} />
                    <Text style={styles.samePersonBadgeText}>REQUIERE CONEXIÓN</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
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
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 12,
      paddingHorizontal: 18,
      paddingBottom: 20,
    },
    handle: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: 99,
      backgroundColor: colors.borderStrong,
      marginBottom: 20,
    },
    header: { flexDirection: 'row', gap: 13, marginBottom: 16 },
    iconWrapper: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.warningBg,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    headerText: { flex: 1, minWidth: 0 },
    title: { fontSize: 16.5, fontFamily: Fonts.bold, color: colors.textPrimary, lineHeight: 21, marginBottom: 7 },
    body: { fontSize: 12.5, fontFamily: Fonts.regular, color: colors.textMuted, lineHeight: 19 },
    bold: { fontFamily: Fonts.semiBold, color: colors.textPrimary },
    compareBox: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 11,
      backgroundColor: colors.surfaceMuted,
      padding: 13,
      gap: 8,
      marginBottom: 18,
    },
    compareRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    compareLabel: { fontSize: 10.5, fontFamily: Fonts.bold, color: colors.textMuted },
    compareValue: { flex: 1, fontSize: 12.5, fontFamily: Fonts.bold, color: colors.textPrimary, textAlign: 'right' },
    spinner: { marginVertical: 16, alignSelf: 'center' },
    actions: { gap: 10 },
    buttonPrimary: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brand,
      borderRadius: 11,
      paddingVertical: 17,
    },
    buttonPrimaryText: { fontSize: 15, fontFamily: Fonts.bold, color: colors.brandForeground },
    buttonSecondary: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 11,
      paddingVertical: 15,
    },
    buttonSecondaryText: { fontSize: 14, fontFamily: Fonts.semiBold, color: colors.textPrimary },
    samePersonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 9,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 11,
      paddingVertical: 15,
      paddingHorizontal: 15,
    },
    samePersonRowDisabled: { opacity: 0.6 },
    samePersonText: { fontSize: 14, fontFamily: Fonts.semiBold, color: colors.textMuted },
    samePersonBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    samePersonBadgeText: { fontSize: 10, fontFamily: Fonts.bold, color: colors.textMuted },
  });
}
