import { useMemo } from 'react';
import { Copy, ArrowRight, Trash2 } from 'lucide-react-native';
import { ConfirmSheet } from '../common/ConfirmSheet';

interface DuplicateAlertModalProps {
  visible: boolean;
  instrumentName: string;
  farmerName?: string;
  isLoading: boolean;
  onOverwrite: () => void;
  onSkip: () => void;
  onCancel: () => void;
}

export function DuplicateAlertModal({
  visible,
  instrumentName,
  farmerName,
  isLoading,
  onOverwrite,
  onSkip,
  onCancel,
}: DuplicateAlertModalProps) {
  const body = useMemo(() => {
    const who = farmerName ? `${farmerName} ya respondió` : 'Ya existe una respuesta para';
    return `${who} «${instrumentName}» para este agricultor. ¿Qué deseas hacer?`;
  }, [farmerName, instrumentName]);

  return (
    <ConfirmSheet
      visible={visible}
      icon={Copy}
      tone="warning"
      title="Esta encuesta ya fue aplicada"
      body={body}
      isLoading={isLoading}
      primaryAction={{ label: 'Pasar a la siguiente encuesta', icon: ArrowRight, onPress: onSkip }}
      secondaryAction={{ label: 'Cancelar', onPress: onCancel }}
      destructiveAction={{ label: 'Sobrescribir las respuestas existentes', icon: Trash2, onPress: onOverwrite }}
      onRequestClose={onCancel}
    />
  );
}
