import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Check } from "lucide-react-native";
import { PrimaryButton } from "../common/PrimaryButton";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import type { ConsentDocument } from "../../api/consents";

export interface ConsentFormValues {
  respondentName: string;
  acceptedDataProcessing: boolean;
  acceptedPhoto: boolean;
  acceptedAudio: boolean;
  acceptedVideo: boolean;
  acceptedFollowUpContact: boolean;
}

interface Props {
  document: ConsentDocument | null;
  loading: boolean;
  submitting: boolean;
  error: string | null;
  defaultRespondentName?: string;
  onSubmit: (values: ConsentFormValues) => void;
}

const INITIAL: ConsentFormValues = {
  respondentName: "",
  acceptedDataProcessing: false,
  acceptedPhoto: false,
  acceptedAudio: false,
  acceptedVideo: false,
  acceptedFollowUpContact: false,
};

/**
 * Spec 78 — pantalla de consentimiento informado, versión móvil. `document`
 * viene de la caché offline (`consentDocumentCacheStorage`) o de la red,
 * según decida `consent.tsx`.
 */
export function ConsentForm({
  document,
  loading,
  submitting,
  error,
  defaultRespondentName,
  onSubmit,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [values, setValues] = useState<ConsentFormValues>({
    ...INITIAL,
    respondentName: defaultRespondentName ?? "",
  });

  useEffect(() => {
    if (defaultRespondentName) {
      setValues((v) => ({ ...v, respondentName: defaultRespondentName }));
    }
  }, [defaultRespondentName]);

  function toggle(key: keyof ConsentFormValues) {
    setValues((v) => ({ ...v, [key]: !v[key] }));
  }

  const canSubmit = !!document && !submitting && values.acceptedDataProcessing;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={styles.loadingText}>Cargando consentimiento…</Text>
      </View>
    );
  }

  if (!document) {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorText}>
          {error ?? "No hay un documento de consentimiento disponible sin conexión."}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.textBox}>
        <Text style={styles.title}>{document.title}</Text>
        <Text style={styles.version}>Versión {document.version}</Text>
        <Text style={styles.paragraph}>{document.body}</Text>
        <Text style={styles.paragraph}>{document.dataProcessingClause}</Text>
        <Text style={styles.paragraph}>{document.multimediaClause}</Text>
        <Text style={styles.paragraph}>{document.rightsClause}</Text>
        <Text style={styles.footerText}>
          {document.responsibleEntity} — {document.contactEmail}
        </Text>
      </View>

      <Text style={styles.label}>Nombre de quien acepta</Text>
      <TextInput
        style={styles.input}
        value={values.respondentName}
        onChangeText={(text) => setValues((v) => ({ ...v, respondentName: text }))}
        placeholder="Nombre completo"
        placeholderTextColor={colors.textMuted}
      />

      <CheckboxRow
        colors={colors}
        emphasized
        checked={values.acceptedDataProcessing}
        onPress={() => toggle("acceptedDataProcessing")}
        label="Autorizo el tratamiento de mis datos personales para fines exclusivamente investigativos. *"
      />

      <Text style={styles.sectionLabel}>
        Registro multimedia del encuentro (opcional, independiente por tipo)
      </Text>
      <CheckboxRow
        colors={colors}
        checked={values.acceptedPhoto}
        onPress={() => toggle("acceptedPhoto")}
        label="Autorizo fotografías"
      />
      <CheckboxRow
        colors={colors}
        checked={values.acceptedAudio}
        onPress={() => toggle("acceptedAudio")}
        label="Autorizo grabaciones de audio"
      />
      <CheckboxRow
        colors={colors}
        checked={values.acceptedVideo}
        onPress={() => toggle("acceptedVideo")}
        label="Autorizo grabaciones de video"
      />
      <CheckboxRow
        colors={colors}
        checked={values.acceptedFollowUpContact}
        onPress={() => toggle("acceptedFollowUpContact")}
        label="Autorizo ser contactado en etapas posteriores del proyecto"
      />

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.buttonWrapper}>
        <PrimaryButton
          label={submitting ? "Guardando…" : "Continuar"}
          onPress={() => onSubmit(values)}
          disabled={!canSubmit}
          loading={submitting}
        />
      </View>
    </ScrollView>
  );
}

function CheckboxRow({
  colors,
  checked,
  onPress,
  label,
  emphasized,
}: {
  colors: ThemeColors;
  checked: boolean;
  onPress: () => void;
  label: string;
  emphasized?: boolean;
}) {
  const styles = createStyles(colors);
  return (
    <TouchableOpacity
      style={[styles.checkboxRow, emphasized && styles.checkboxRowEmphasized]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Check size={14} color={colors.brandForeground} />}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1 },
    content: { padding: 16, gap: 14, paddingBottom: 32 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
    loadingText: { fontSize: 14, fontFamily: Fonts.regular, color: colors.textMuted },
    textBox: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      gap: 8,
      maxHeight: 320,
    },
    title: { fontSize: 15, fontFamily: Fonts.bold, color: colors.textPrimary },
    version: { fontSize: 11, fontFamily: Fonts.regular, color: colors.textMuted },
    paragraph: { fontSize: 13, fontFamily: Fonts.regular, color: colors.textPrimary, lineHeight: 19 },
    footerText: { fontSize: 11, fontFamily: Fonts.regular, color: colors.textMuted },
    label: { fontSize: 12, fontFamily: Fonts.regular, color: colors.textMuted },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: colors.textPrimary,
    },
    sectionLabel: { fontSize: 11, fontFamily: Fonts.regular, color: colors.textMuted, marginTop: 4 },
    checkboxRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
    },
    checkboxRowEmphasized: {
      borderColor: colors.brand,
      backgroundColor: colors.brandSubtleBg,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    checkboxChecked: { backgroundColor: colors.brand, borderColor: colors.brand },
    checkboxLabel: { flex: 1, fontSize: 13, fontFamily: Fonts.regular, color: colors.textPrimary },
    errorBox: {
      margin: 16,
      padding: 12,
      backgroundColor: colors.dangerBg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.dangerFg,
    },
    errorText: { fontSize: 13, fontFamily: Fonts.regular, color: colors.dangerFg },
    buttonWrapper: { marginTop: 8 },
  });
}
