import { Tabs, useRouter } from "expo-router";
import {
  Clock,
  LandPlot,
  LogOut,
  Map,
  FileText,
  MessageSquare,
  RefreshCw,
} from "lucide-react-native";
import { Pressable, StyleSheet, Text, useWindowDimensions, View, type TextStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../../src/store/useAuthStore";
import { useSyncStatusStore } from "../../src/store/useSyncStatusStore";
import { useDraftCountStore } from "../../src/store/useDraftCountStore";
import { Fonts } from "../../src/theme/fonts";
import { useTheme } from "../../src/theme/ThemeProvider";
import type { ThemeColors } from "../../src/theme/colors";
import type { EffectiveTheme } from "../../src/theme/resolveTheme";
import { AppText } from "../../src/components/common/AppText";
import { ThemeToggle } from "../../src/components/common/ThemeToggle";
import { resolveTabBarStyle, TAB_BAR_PADDING_TOP } from "../../src/lib/resolveTabBarStyle";
import { useEffect, useMemo, useRef } from "react";

// Pantallas angostas (spec 74, Fase 3 — a pedido del usuario): por debajo de
// este ancho el texto "Salir" se oculta y el botón queda solo-ícono, para
// dejarle más espacio a la píldora de conexión y al nombre del usuario. El
// ícono conserva accessibilityLabel, así que no se pierde el texto para
// lectores de pantalla — no es una simplificación del copy visible en
// pantallas normales, que sigue completo.
const HEADER_COMPACT_BREAKPOINT = 360;

function TabsHeader() {
  const { user, logout } = useAuthStore();
  const { isOnline, pendingCount } = useSyncStatusStore();
  const { colors, effectiveTheme } = useTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < HEADER_COMPACT_BREAKPOINT;
  const styles = useMemo(() => createStyles(colors, effectiveTheme), [colors, effectiveTheme]);
  const router = useRouter();

  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleTitleTap() {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      router.push("/dev/logs");
      return;
    }
    tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 1500);
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.headerContainer}>
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        <Pressable style={styles.headerLeft} onPress={handleTitleTap} accessibilityRole="text">
          <Text style={styles.appName} numberOfLines={1} ellipsizeMode="tail">
            Sos Agro 4.C
          </Text>
          {user?.name ? (
            <AppText style={styles.userName} numberOfLines={1}>{user.name}</AppText>
          ) : null}
        </Pressable>
        <View style={[styles.headerRight, isCompact && styles.headerRightCompact]}>
          <View
            style={[
              styles.statusPill,
              !isOnline && styles.statusPillOffline,
              isCompact && styles.statusPillCompact,
            ]}
          >
            <View style={[styles.dot, isOnline ? styles.dotOnline : styles.dotOffline]} />
            <AppText style={[styles.statusText, !isOnline && styles.statusTextOffline]}>
              {isOnline ? "En línea" : "Sin conexión"}
            </AppText>
          </View>
          <View style={styles.themeToggleWrapper}>
            <ThemeToggle size={16} color={colors.headerFg} />
          </View>
          <Pressable
            onPress={logout}
            style={[styles.logoutBtn, isCompact && styles.logoutBtnCompact]}
            accessibilityRole="button"
            accessibilityLabel="Cerrar sesión"
          >
            <LogOut size={15} color={colors.headerFg} />
            {isCompact ? null : <AppText style={styles.logoutText}>Salir</AppText>}
          </Pressable>
        </View>
      </View>
      {pendingCount > 0 ? (
        <View style={styles.pendingBanner}>
          <Clock size={15} color={colors.warningFg} />
          <Text style={styles.pendingText}>
            {pendingCount} encuesta{pendingCount !== 1 ? "s" : ""} pendiente{pendingCount !== 1 ? "s" : ""} de sincronizar
          </Text>
          <Pressable onPress={() => router.push("/(tabs)/sync")} hitSlop={8}>
            <Text style={styles.pendingAction}>Ver</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// Indicador de 3.5 px sobre la pestaña activa (spec 74, Fase 2 — engrosado
// desde 2.5 px a pedido del usuario en la ronda TC-074-12). El tipo del
// parámetro queda en `any` documentado: `BottomTabBarButtonProps` vive en
// `@react-navigation/bottom-tabs`, dependencia transitiva de expo-router que
// este repo no declara en `package.json` — tiparlo exigiría agregarla como
// dependencia directa solo para el tipo.
// TODO: type this
function TabBarButton(props: any) {
  // BottomTabItem (@react-navigation/bottom-tabs 7.18) no manda
  // `accessibilityState` a `button()`: manda `aria-selected` directo (hallazgo
  // TC-074-12, 2026-08-24) — leer `accessibilityState?.selected` daba
  // siempre `false` y la línea nunca se pintaba.
  const { children, style, "aria-selected": ariaSelected, onPress, ...rest } = props;
  const { colors } = useTheme();
  const selected = !!ariaSelected;

  return (
    <Pressable
      accessibilityState={{ selected }}
      onPress={onPress}
      style={style}
      {...rest}
    >
      {selected ? (
        <View style={[tabButtonStyles.indicator, { backgroundColor: colors.brand }]} />
      ) : null}
      {children}
    </Pressable>
  );
}

const tabButtonStyles = StyleSheet.create({
  indicator: {
    position: "absolute",
    // El botón de la pestaña empieza DESPUÉS del paddingTop que
    // resolveTabBarStyle aplica a todo el tab bar (6 px, por encima de la
    // fila de botones) — top:0 quedaba pegado al borde del botón, no al
    // borde real de la barra (hallazgo TC-074-12, 2026-08-24).
    top: -TAB_BAR_PADDING_TOP,
    left: 0,
    right: 0,
    height: 3.5,
    borderRadius: 99,
  },
});

// Spec 74, Fase 2 — hallazgo TC-074-12: con las cinco etiquetas completas
// (deuda de la Fase 2, no abreviadas — ver "Qué NO debe cambiar" del spec)
// y la fuente del sistema al 130%, el `<Label>` por defecto de la librería
// envuelve a dos líneas y el tab bar se lee como si hubiera más de cinco
// pestañas. `AppText` ya trae el techo `MAX_FONT_SCALE = 1.3` (spec 24/62)
// para texto de layout fijo — se reutiliza acá en vez de reinventar un tope
// nuevo, con `numberOfLines={1}` para garantizar una sola línea.
function renderTabLabel(title: string, style: TextStyle) {
  function TabLabel({ color }: { color: string }) {
    return (
      <AppText style={[style, { color }]} numberOfLines={1}>
        {title}
      </AppText>
    );
  }
  return TabLabel;
}

export default function TabsLayout() {
  const { colors, effectiveTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors, effectiveTheme), [colors, effectiveTheme]);
  const insets = useSafeAreaInsets();
  const tabBarStyle = useMemo(
    () => resolveTabBarStyle({ bottomInset: insets.bottom, colors }),
    [insets.bottom, colors],
  );
  const draftCount = useDraftCountStore((s) => s.count);

  // Fuente reactiva del badge de Borradores (spec 74, deuda diferida de la
  // Fase 3 a esta fase): sin esto el conteo solo se conocería después de
  // visitar esa pestaña al menos una vez.
  useEffect(() => {
    useDraftCountStore.getState().refresh();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <TabsHeader />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brand,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle,
          tabBarButton: TabBarButton,
        }}
      >
        <Tabs.Screen
          name="campaign/index"
          options={{
            title: "Campañas",
            tabBarLabel: renderTabLabel("Campañas", styles.tabLabel),
            tabBarIcon: ({ color, size }) => (
              <Map size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="drafts/index"
          options={{
            title: "Borradores",
            tabBarLabel: renderTabLabel("Borradores", styles.tabLabel),
            tabBarIcon: ({ color, size }) => (
              <View>
                <FileText size={size} color={color} />
                {draftCount > 0 ? (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText} numberOfLines={1}>
                      {draftCount > 99 ? "99+" : draftCount}
                    </Text>
                  </View>
                ) : null}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="sync/index"
          options={{
            title: "Sincronización",
            tabBarLabel: renderTabLabel("Sincronización", styles.tabLabel),
            tabBarIcon: ({ color, size }) => (
              <RefreshCw size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="requests/index"
          options={{
            title: "Solicitudes",
            tabBarLabel: renderTabLabel("Solicitudes", styles.tabLabel),
            tabBarIcon: ({ color, size }) => (
              <MessageSquare size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="plots/index"
          options={{
            title: "Lotes",
            tabBarLabel: renderTabLabel("Lotes", styles.tabLabel),
            tabBarIcon: ({ color, size }) => (
              <LandPlot size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

function createStyles(colors: ThemeColors, effectiveTheme: EffectiveTheme) {
  // Spec 74, Fase 0 — el header ya no usa colors.brand como fondo (verde en
  // claro, amarillo en oscuro): usa los tokens dedicados headerBg/headerFg,
  // que en oscuro son surfaceMuted con borde en vez del amarillo de marca.
  // Los overlays y puntos de estado se derivan de headerFg, que ya resuelve
  // el contraste correcto en ambos temas sin el cálculo especial que el
  // spec 63 tuvo que introducir.
  const overlaySoft = colors.headerPill;
  const overlayBorder = colors.headerBorder;

  return StyleSheet.create({
    headerContainer: {
      backgroundColor: colors.headerBg,
      borderBottomWidth: effectiveTheme === "dark" ? 1 : 0,
      borderBottomColor: colors.headerBorder,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    headerCompact: {
      paddingHorizontal: 14,
    },
    headerLeft: {
      flexShrink: 1,
      // Sin esto, un flex item con contenido de texto no encoge por debajo de
      // su ancho intrínseco (comportamiento por defecto de RN/web): el título
      // empujaba al resto del header en vez de truncarse.
      minWidth: 0,
    },
    appName: {
      fontSize: 18,
      fontFamily: Fonts.bold,
      color: colors.headerFg,
    },
    userName: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: colors.headerFg,
      opacity: 0.75,
      marginTop: 1,
    },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      // Fixed size: the connection-status pill is operationally critical in
      // the field and must stay fully visible even when the left-side
      // username is long or the system font scale is high (spec 24). "Salir"
      // stays icon-only below HEADER_COMPACT_BREAKPOINT (spec 74, Fase 3) to
      // free up space for it instead of shrinking. Only headerLeft (and
      // userName inside it) shrinks/truncates.
      flexShrink: 0,
    },
    // Pantallas angostas (spec 74, Fase 3): el gap entre píldora/toggle/salir
    // se reduce, no desaparece — sigue habiendo separación visual, solo menos
    // ancho perdido en el espaciado que en el contenido.
    headerRightCompact: {
      gap: 6,
    },
    // Spec 74, Fase 2 — la píldora se tiñe de ámbar cuando está offline, en
    // vez de solo cambiar el color del punto: es el nivel 1 de la jerarquía
    // de conectividad de tres niveles (deuda #4), y debe leerse de un
    // vistazo sin depender del texto.
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: overlaySoft,
      borderWidth: 1,
      borderColor: overlayBorder,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
    },
    statusPillCompact: {
      paddingHorizontal: 7,
    },
    statusPillOffline: {
      backgroundColor: colors.warningBg,
      borderColor: colors.warningFg,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    dotOnline: { backgroundColor: colors.successFg },
    dotOffline: { backgroundColor: colors.warningFg },
    statusText: {
      fontSize: 11.5,
      fontFamily: Fonts.semiBold,
      color: colors.headerFg,
    },
    statusTextOffline: {
      color: colors.warningFg,
    },
    themeToggleWrapper: {
      width: 36,
      height: 36,
      borderRadius: 9,
      backgroundColor: overlaySoft,
      borderWidth: 1,
      borderColor: overlayBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    logoutBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      height: 36,
      paddingHorizontal: 11,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: overlayBorder,
    },
    // Solo-ícono en pantallas angostas (< HEADER_COMPACT_BREAKPOINT): sin
    // texto no hace falta el padding horizontal amplio, así queda cuadrado
    // como themeToggleWrapper en vez de un rectángulo con espacio vacío.
    logoutBtnCompact: {
      width: 36,
      paddingHorizontal: 0,
      justifyContent: "center",
    },
    logoutText: {
      fontSize: 12,
      fontFamily: Fonts.semiBold,
      color: colors.headerFg,
    },
    pendingBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      backgroundColor: colors.warningBg,
      borderBottomWidth: 1,
      borderBottomColor: colors.warningFg,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    pendingText: {
      flex: 1,
      fontSize: 12,
      fontFamily: Fonts.medium,
      color: colors.warningFg,
    },
    pendingAction: {
      fontSize: 11.5,
      fontFamily: Fonts.bold,
      color: colors.warningFg,
      textDecorationLine: "underline",
    },
    tabLabel: {
      fontFamily: Fonts.semiBold,
      fontSize: 11,
    },
    tabBadge: {
      position: "absolute",
      top: -4,
      right: -8,
      minWidth: 15,
      height: 15,
      borderRadius: 8,
      paddingHorizontal: 3,
      backgroundColor: colors.dangerFg,
      alignItems: "center",
      justifyContent: "center",
    },
    tabBadgeText: {
      fontFamily: Fonts.extraBold,
      fontSize: 9,
      color: "#FFFFFF",
    },
  });
}
