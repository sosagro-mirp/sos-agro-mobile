import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useChangeRequestStore } from '../../store/useChangeRequestStore';
import { Fonts } from '../../theme/fonts';

export const ChangeRequestBanner: React.FC = () => {
  const hasNewResolved = useChangeRequestStore((s) => s.hasNewResolved);
  const setHasNewResolved = useChangeRequestStore((s) => s.setHasNewResolved);

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

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#D1FAE5',
    borderLeftWidth: 4,
    borderLeftColor: '#1B6B3A',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  text: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: '#065F46',
    flex: 1,
  },
  dismiss: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dismissText: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: '#1B6B3A',
  },
});
