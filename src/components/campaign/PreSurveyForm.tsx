import React, { useState } from "react";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Fonts } from "../../theme/fonts";
import { PrimaryButton } from "../common/PrimaryButton";
import type { PreSurveyFormData } from "../../types/instrument";

interface PreSurveyFormProps {
  onSubmit: (data: PreSurveyFormData) => void;
  isLoading?: boolean;
}

// Hardcoded crop options (phase 5 will wire real IDs)
const CROPS: { id: string; label: string }[] = [
  { id: "crop-cafe", label: "Café" },
  { id: "crop-cacao", label: "Cacao" },
  { id: "crop-cannabis", label: "Cannabis" },
  { id: "crop-canamo", label: "Cáñamo" },
];

const EMPTY_FORM: PreSurveyFormData = {
  mode: "search",
  searchQuery: "",
  name: "",
  lastName: "",
  documentId: "",
  phone: "",
  email: "",
  farmName: "",
  departmentId: "",
  townId: "",
  vereda: "",
  latitude: "",
  longitude: "",
  altitude: "",
  cropIds: [],
  selectedFarmerId: null,
};

interface ValidationErrors {
  name?: string;
  lastName?: string;
  documentId?: string;
}

export const PreSurveyForm: React.FC<PreSurveyFormProps> = ({
  onSubmit,
  isLoading = false,
}) => {
  const [form, setForm] = useState<PreSurveyFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<ValidationErrors>({});

  const setField = <K extends keyof PreSurveyFormData>(
    key: K,
    value: PreSurveyFormData[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key in errors) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const switchMode = (mode: PreSurveyFormData["mode"]) => {
    setForm({ ...EMPTY_FORM, mode });
    setErrors({});
  };

  const toggleCrop = (cropId: string) => {
    setForm((prev) => {
      const already = prev.cropIds.includes(cropId);
      return {
        ...prev,
        cropIds: already
          ? prev.cropIds.filter((id) => id !== cropId)
          : [...prev.cropIds, cropId],
      };
    });
  };

  const validate = (): boolean => {
    if (form.mode === "search") return true;

    const next: ValidationErrors = {};
    if (!form.name.trim()) next.name = "El nombre es requerido";
    if (!form.lastName.trim()) next.lastName = "El apellido es requerido";
    if (!form.documentId.trim()) next.documentId = "El documento es requerido";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onSubmit(form);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Mode tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, form.mode === "search" && styles.tabActive]}
          onPress={() => switchMode("search")}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.tabText,
              form.mode === "search" && styles.tabTextActive,
            ]}
          >
            Buscar
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, form.mode === "create" && styles.tabActive]}
          onPress={() => switchMode("create")}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.tabText,
              form.mode === "create" && styles.tabTextActive,
            ]}
          >
            Registrar nuevo
          </Text>
        </TouchableOpacity>
      </View>

      {form.mode === "search" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Buscar agricultor</Text>
          <TextInput
            style={styles.input}
            placeholder="Nombre o número de documento"
            placeholderTextColor="#9CA3AF"
            value={form.searchQuery}
            onChangeText={(v) => setField("searchQuery", v)}
            autoCapitalize="none"
            returnKeyType="search"
          />
          <TouchableOpacity
            style={styles.notFoundLink}
            onPress={() => switchMode("create")}
            activeOpacity={0.7}
          >
            <Text style={styles.notFoundText}>
              ¿No encontrado? Registrar nuevo
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos del agricultor</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                Nombre <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, errors.name !== undefined && styles.inputError]}
                placeholder="Nombre"
                placeholderTextColor="#9CA3AF"
                value={form.name}
                onChangeText={(v) => setField("name", v)}
                autoCapitalize="words"
              />
              {errors.name !== undefined && (
                <Text style={styles.errorText}>{errors.name}</Text>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                Apellido <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[
                  styles.input,
                  errors.lastName !== undefined && styles.inputError,
                ]}
                placeholder="Apellido"
                placeholderTextColor="#9CA3AF"
                value={form.lastName}
                onChangeText={(v) => setField("lastName", v)}
                autoCapitalize="words"
              />
              {errors.lastName !== undefined && (
                <Text style={styles.errorText}>{errors.lastName}</Text>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                Documento <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[
                  styles.input,
                  errors.documentId !== undefined && styles.inputError,
                ]}
                placeholder="Número de documento"
                placeholderTextColor="#9CA3AF"
                value={form.documentId}
                onChangeText={(v) => setField("documentId", v)}
                keyboardType="numeric"
              />
              {errors.documentId !== undefined && (
                <Text style={styles.errorText}>{errors.documentId}</Text>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Teléfono</Text>
              <TextInput
                style={styles.input}
                placeholder="Número de teléfono"
                placeholderTextColor="#9CA3AF"
                value={form.phone}
                onChangeText={(v) => setField("phone", v)}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos de la finca</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Nombre de la finca</Text>
              <TextInput
                style={styles.input}
                placeholder="Nombre de la finca"
                placeholderTextColor="#9CA3AF"
                value={form.farmName}
                onChangeText={(v) => setField("farmName", v)}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Vereda</Text>
              <TextInput
                style={styles.input}
                placeholder="Nombre de la vereda"
                placeholderTextColor="#9CA3AF"
                value={form.vereda}
                onChangeText={(v) => setField("vereda", v)}
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cultivos</Text>
            <View style={styles.cropsGrid}>
              {CROPS.map((crop) => {
                const selected = form.cropIds.includes(crop.id);
                return (
                  <TouchableOpacity
                    key={crop.id}
                    style={[
                      styles.cropChip,
                      selected && styles.cropChipSelected,
                    ]}
                    onPress={() => toggleCrop(crop.id)}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        selected && styles.checkboxSelected,
                      ]}
                    >
                      {selected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text
                      style={[
                        styles.cropLabel,
                        selected && styles.cropLabelSelected,
                      ]}
                    >
                      {crop.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </>
      )}

      <View style={styles.submitRow}>
        <PrimaryButton
          label="Iniciar visita"
          onPress={handleSubmit}
          loading={isLoading}
          disabled={isLoading}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 20,
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    padding: 3,
    gap: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: "#6B7280",
  },
  tabTextActive: {
    fontFamily: Fonts.semiBold,
    color: "#1B6B3A",
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: "#374151",
  },
  fieldGroup: {
    gap: 4,
  },
  label: {
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: "#374151",
  },
  required: {
    color: "#EF4444",
  },
  input: {
    height: 48,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontFamily: Fonts.regular,
    fontSize: 15,
    color: "#111827",
  },
  inputError: {
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
  },
  errorText: {
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: "#EF4444",
  },
  notFoundLink: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  notFoundText: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: "#1B6B3A",
    textDecorationLine: "underline",
  },
  cropsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  cropChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    minWidth: "45%",
  },
  cropChipSelected: {
    borderColor: "#1B6B3A",
    backgroundColor: "#F0FDF4",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    borderColor: "#1B6B3A",
    backgroundColor: "#1B6B3A",
  },
  checkmark: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    color: "#FFFFFF",
    lineHeight: 14,
  },
  cropLabel: {
    fontFamily: Fonts.medium,
    fontSize: 14,
    color: "#374151",
  },
  cropLabelSelected: {
    color: "#1B6B3A",
    fontFamily: Fonts.semiBold,
  },
  submitRow: {
    marginTop: 8,
  },
});
