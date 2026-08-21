import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useChangeRequestStore } from '../../store/useChangeRequestStore';
import { Fonts } from '../../theme/fonts';
import { useTheme } from '../../theme/ThemeProvider';
import type { ThemeColors } from '../../theme/colors';

export const ChangeRequestBanner: React.FC = () => {
  const hasNewResolved = useChangeRequestStore((s) => s.hasNewResolved);
  const setHasNewResolved = useChangeRequestStore((s) => s.setHasNewResolved);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!hasNewResolved) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        Tienes solicitudes de cambio resueltas. Revísalas en la pestaña de solicitudes.
      </Text>
      <TouchableOpacity onPress={() => setHasNewResolved(false)} style={styles.dismiss}>
        <Text style={styles.dismissText}>Cerrar</Text>
      </TouchableOpacity>
    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    banner: {
      backgroundColor: colors.brandSubtleBg,
      borderLeftWidth: 4,
      borderLeftColor: colors.brand,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    text: {
      fontFamily: Fonts.regular,
      fontSize: 13,
      color: colors.brandSubtleFg,
      flex: 1,
    },
    dismiss: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    dismissText: {
      fontFamily: Fonts.semiBold,
      fontSize: 13,
      color: colors.brand,
    },
  });
}
