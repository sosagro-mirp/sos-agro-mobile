import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Location from "expo-location";
import { MapPin } from "lucide-react-native";
import { Fonts } from "../../theme/fonts";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemeColors } from "../../theme/colors";
import type { InstrumentDraftAnswer } from "../../types/instrument";

type GpsState = "idle" | "requesting" | "obtained" | "error";

const GPS_TIMEOUT_MS = 20_000;

class GpsTimeoutError extends Error {}

function getCurrentPositionWithTimeout(
  options: Location.LocationOptions,
  timeoutMs: number,
): Promise<Location.LocationObject> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new GpsTimeoutError()), timeoutMs);
    Location.getCurrentPositionAsync(options).then(
      (location) => {
        clearTimeout(timer);
        resolve(location);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

interface Props {
  questionId: string;
  fieldType: "latitude" | "longitude";
  value: number | undefined;
  onChange: (answer: InstrumentDraftAnswer) => void;
  onAltitudeObtained?: (altitude: number) => void;
}

export function GpsCoordinateInput({
  questionId,
  fieldType,
  value,
  onChange,
  onAltitudeObtained,
}: Props): React.JSX.Element {
  const [gpsState, setGpsState] = useState<GpsState>("idle");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [raw, setRaw] = useState<string>(value !== undefined ? String(value) : "");
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  function handleTextChange(text: string): void {
    setRaw(text);
    if (text === "" || text === "-") {
      onChange({ questionId });
      return;
    }
    const parsed = parseFloat(text);
    if (!isNaN(parsed)) {
      onChange({ questionId, numericValue: parsed });
    } else {
      onChange({ questionId });
    }
  }

  async function handleGpsPress(): Promise<void> {
    setGpsState("requesting");
    setErrorMessage("");

    try {
      const { status } = await Location.getForegroundPermissionsAsync();

      if (status !== "granted") {
        const { status: requested } = await Location.requestForegroundPermissionsAsync();
        if (requested !== "granted") {
          setGpsState("error");
          setErrorMessage(
            "Permiso de ubicación denegado. Ve a Ajustes del dispositivo para habilitarlo.",
          );
          return;
        }
      }

      const location = await getCurrentPositionWithTimeout(
        { accuracy: Location.Accuracy.High },
        GPS_TIMEOUT_MS,
      );

      const coord =
        fieldType === "latitude"
          ? location.coords.latitude
          : location.coords.longitude;

      const coordStr = String(coord);
      setRaw(coordStr);
      setAccuracy(location.coords.accuracy ?? null);
      onChange({ questionId, numericValue: coord });

      if (onAltitudeObtained && location.coords.altitude != null) {
        onAltitudeObtained(location.coords.altitude);
      }

      setGpsState("obtained");
    } catch (error) {
      setGpsState("error");
      setErrorMessage(
        error instanceof GpsTimeoutError
          ? "La búsqueda de señal GPS tardó demasiado. Intenta de nuevo en un lugar con mejor visibilidad al cielo."
          : "No se pudo obtener la ubicación. Verifica que el GPS esté activo.",
      );
    }
  }

  const isRequesting = gpsState === "requesting";
  const buttonLabel =
    gpsState === "obtained" ? "Actualizar GPS" : "Usar GPS";

  return (
    <View style={styles.container}>
      <TextInput
        style={[styles.input, !isRequesting && styles.inputActive]}
        value={raw}
        onChangeText={handleTextChange}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.textMuted}
        placeholder={fieldType === "latitude" ? "0.0000" : "0.0000"}
        returnKeyType="done"
        editable={!isRequesting}
      />

      <TouchableOpacity
        style={[styles.gpsButton, isRequesting && styles.gpsButtonDisabled]}
        onPress={handleGpsPress}
        disabled={isRequesting}
        activeOpacity={0.7}
      >
        {isRequesting ? (
          <ActivityIndicator size="small" color={colors.brandForeground} />
        ) : (
          <View style={styles.gpsButtonContent}>
            <MapPin size={16} color={colors.brandForeground} />
            <Text style={styles.gpsButtonText}>{buttonLabel}</Text>
          </View>
        )}
      </TouchableOpacity>

      {gpsState === "obtained" && accuracy !== null && (
        <Text style={styles.accuracyText}>Precisión: ±{Math.round(accuracy)} m</Text>
      )}

      {gpsState === "error" && (
        <Text style={styles.errorText}>{errorMessage}</Text>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      width: "100%",
      gap: 8,
    },
    input: {
      fontFamily: Fonts.regular,
      fontSize: 18,
      lineHeight: 26,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.borderStrong,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 0,
      height: 56,
      minHeight: 56,
    },
    inputActive: {
      borderColor: colors.borderStrong,
    },
    gpsButton: {
      backgroundColor: colors.brand,
      borderRadius: 12,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    gpsButtonDisabled: {
      backgroundColor: colors.textMuted,
    },
    gpsButtonContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    gpsButtonText: {
      fontFamily: Fonts.semiBold,
      fontSize: 15,
      color: colors.brandForeground,
    },
    accuracyText: {
      fontFamily: Fonts.regular,
      fontSize: 13,
      color: colors.textMuted,
    },
    errorText: {
      fontFamily: Fonts.regular,
      fontSize: 13,
      color: colors.dangerFg,
    },
  });
}
