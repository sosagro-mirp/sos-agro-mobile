import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Location from "expo-location";
import { MapPin, Navigation, LoaderCircle, Info } from "lucide-react-native";
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

// Ícono girando con `Animated` en vez de `ActivityIndicator` (spec 74, mapa
// de reemplazo — `LoaderCircle` reemplaza todo `ActivityIndicator`). Copia
// local del mismo patrón que `login.tsx`: no hay un componente compartido
// para esto todavía y esta fase no toca `login.tsx` (ya mergeado).
function SpinningLoader({ size, color }: { size: number; color: string }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rotation]);

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <LoaderCircle size={size} color={color} />
    </Animated.View>
  );
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
    // Escribir a mano invalida la marca AUTOMÁTICO — vuelve a idle.
    setGpsState("idle");
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
  const buttonLabel = gpsState === "obtained" ? "Actualizar GPS" : "Usar GPS";

  return (
    <View style={styles.container}>
      {gpsState === "obtained" && (
        <View style={styles.autoRow}>
          <View style={styles.autoPill}>
            <Navigation size={11} color={colors.infoFg} strokeWidth={2.8} />
            <Text style={styles.autoPillText}>AUTOMÁTICO</Text>
          </View>
        </View>
      )}

      <TextInput
        style={styles.input}
        value={raw}
        onChangeText={handleTextChange}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.textMuted}
        placeholder={fieldType === "latitude" ? "0.0000" : "0.0000"}
        returnKeyType="done"
        editable={!isRequesting}
      />

      {isRequesting ? (
        <View style={styles.searchingCard}>
          <SpinningLoader size={20} color={colors.brandSubtleFg} />
          <View style={styles.searchingText}>
            <Text style={styles.searchingTitle}>Buscando señal GPS…</Text>
            <Text style={styles.searchingHint}>
              Puede tardar unos segundos según la visibilidad al cielo
            </Text>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.gpsButton}
          onPress={handleGpsPress}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <MapPin size={16} color={colors.brandForeground} strokeWidth={2.2} />
          <Text style={styles.gpsButtonText}>{buttonLabel}</Text>
        </TouchableOpacity>
      )}

      {gpsState === "obtained" && accuracy !== null && (
        <Text style={styles.accuracyText}>Precisión: ±{Math.round(accuracy)} m</Text>
      )}

      {gpsState === "error" && (
        <Text style={styles.errorText}>{errorMessage}</Text>
      )}

      {!isRequesting && (
        <View style={styles.hintBanner}>
          <Info size={15} color={colors.textMuted} strokeWidth={2.2} />
          <Text style={styles.hintBannerText}>
            Salí a cielo abierto para mejorar la precisión. Podés escribir las coordenadas a mano.
          </Text>
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      width: "100%",
      gap: 10,
    },
    autoRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
    },
    autoPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.infoBg,
      borderRadius: 99,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    autoPillText: {
      fontFamily: Fonts.extraBold,
      fontSize: 9.5,
      color: colors.infoFg,
      letterSpacing: 0.4,
    },
    input: {
      fontFamily: Fonts.semiBold,
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 14,
      height: 48,
    },
    gpsButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.brand,
      borderRadius: 10,
      height: 48,
    },
    gpsButtonText: {
      fontFamily: Fonts.bold,
      fontSize: 13.5,
      color: colors.brandForeground,
    },
    searchingCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      borderWidth: 1,
      borderColor: colors.brand,
      borderRadius: 11,
      backgroundColor: colors.brandSubtleBg,
      paddingHorizontal: 14,
      paddingVertical: 15,
    },
    searchingText: { flex: 1, minWidth: 0 },
    searchingTitle: {
      fontFamily: Fonts.bold,
      fontSize: 13.5,
      color: colors.brandSubtleFg,
      marginBottom: 3,
    },
    searchingHint: {
      fontFamily: Fonts.regular,
      fontSize: 11,
      color: colors.brandSubtleFg,
      opacity: 0.85,
    },
    accuracyText: {
      fontFamily: Fonts.regular,
      fontSize: 11.5,
      color: colors.textMuted,
    },
    errorText: {
      fontFamily: Fonts.regular,
      fontSize: 11.5,
      color: colors.dangerFg,
    },
    hintBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      backgroundColor: colors.surfaceMuted,
      borderRadius: 9,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    hintBannerText: {
      flex: 1,
      fontFamily: Fonts.regular,
      fontSize: 11.5,
      lineHeight: 16,
      color: colors.textMuted,
    },
  });
}
