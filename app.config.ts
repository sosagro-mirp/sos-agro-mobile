import { ExpoConfig, ConfigContext } from 'expo/config';
// `app.config.ts` se evalúa con un require() simple, sin el pipeline de TS
// del proyecto, y no puede resolver imports relativos a `colors.ts` — de ahí
// este módulo compartido en JS plano (ver el comentario en el propio
// archivo).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const splashBackground = require('./src/theme/splashBackground');

export default ({ config }: ConfigContext): ExpoConfig => {
  const [major, minor, patch] = (config.version ?? '1.0.0').split('.').map(Number);
  const versionCode = major * 10000 + minor * 100 + patch;

  // Spec 75: los builds release (preview/production) bloquean HTTP sin cifrar
  // por defecto en Android. Solo se habilita cleartext cuando el propio
  // EXPO_PUBLIC_API_BASE_URL del build es http:// (backend de desarrollo en
  // LAN para pruebas manuales) — production/preview reales siempre usan
  // https://sosagroapi.up.railway.app, así que nunca activan esto.
  const usesCleartextTraffic = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').startsWith('http://');

  return {
    ...config,
    name: 'Sos Agro 4.C',
    slug: 'sosagro-characterization',
    // Spec 80: con runtimeVersion.policy = 'appVersion' (ver más abajo), este
    // campo ES el runtime del canal OTA. Subirlo sin compilar e instalar un
    // APK nuevo corta el canal para todo binario ya en campo, en silencio y
    // sin error visible: el update se publica, el servidor lo sirve para el
    // runtime nuevo, y ningún dispositivo en 1.0.0 lo recibe jamás. Regla de
    // oro (mobile/docs/ota-updates.md): no tocar `version` salvo que se vaya
    // a compilar e instalar un build nativo nuevo en las tablets.
    version: '1.0.0',
    // Spec 74, Fase 10 (aprobada 2026-08-26): antes 'portrait' bloqueaba
    // rotación en toda la app. Tablet necesita landscape para el layout de
    // dos paneles; sin expo-screen-orientation (dependencia nueva que este
    // spec no puede agregar) no hay forma de bloquear la orientación por
    // pantalla, así que se permite rotación libre en toda la app y las
    // pantallas delicadas (captura GPS, preguntas con teclado) se diseñan
    // para tolerar ambas orientaciones en vez de bloquear una.
    orientation: 'default',
    icon: './assets/icon.png',
    // Spec 76, Fase 1: estaba en 'light', contradiciendo a una app que sí
    // soporta tema oscuro. Hoy no tiene efecto en Android (usesInterfaceStyle
    // requiere expo-system-ui, que no está instalado), pero es una bomba de
    // relojería: el día que ese paquete entre como dependencia transitiva de
    // cualquier otro paquete de Expo, la preferencia "sistema" dejaría de
    // funcionar sola. En iOS ya se aplicaría hoy.
    userInterfaceStyle: 'automatic',
    scheme: 'sosagro',
    // Spec 80, decisión del 2026-08-30: se mantiene 'appVersion' en vez de
    // pasar a 'fingerprint'. Cambio cero en configuración y un runtime legible
    // en campo, a costa de que nada impide publicar por OTA JS que necesite un
    // módulo nativo ausente, y de que `version` (arriba) se vuelve un campo
    // peligroso — ver su comentario.
    runtimeVersion: { policy: 'appVersion' },
    updates: {
      url: 'https://u.expo.dev/a9915da7-c235-4537-a1a0-de31ac73d63b',
      enabled: true,
      fallbackToCacheTimeout: 0,
      // Spec 80: verificar al cargar la app. En una zona sin cobertura no
      // bloquea el arranque (fallbackToCacheTimeout: 0 ya lo garantiza); si
      // hay red, la descarga corre en segundo plano y queda lista para el
      // siguiente arranque en frío, o para aplicarse a mano desde el botón
      // "Buscar actualización ahora" de la pantalla de diagnóstico.
      checkAutomatically: 'ON_LOAD',
    },
    ios: {
      // Spec 74, Fase 10 — layout de dos paneles en tablet.
      supportsTablet: true,
      bundleIdentifier: 'co.edu.itm.sosagro.characterization',
    },
    android: {
      package: 'co.edu.itm.sosagro.characterization',
      adaptiveIcon: {
        backgroundColor: '#1B6B3A',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
      },
      permissions: [
        'INTERNET',
        'ACCESS_NETWORK_STATE',
        'CAMERA',
        // RECORD_AUDIO lo inyecta el config plugin de expo-audio
        // (recordAudioAndroid, true por defecto). Antes había aquí un
        // 'MICROPHONE' que no corresponde a ningún permiso real de Android.
        'READ_MEDIA_IMAGES',
        'READ_MEDIA_VIDEO',
        'READ_MEDIA_AUDIO',
        'READ_EXTERNAL_STORAGE',
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
      ],
      versionCode,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-sqlite',
      'expo-background-task',
      // Spec 76, Fase 2: antes el plugin actuaba con su configuración por
      // defecto y dejaba `values-night/colors.xml` vacío, con
      // `splashscreen_background` fijo en #FFFFFF. En una tablet en modo
      // oscuro, el arranque era un rectángulo blanco a pantalla completa
      // antes de entrar a una interfaz oscura — y SplashGate (Fase 3) agravó
      // el síntoma al retener el splash más tiempo. Los colores vienen de
      // ./src/theme/splashBackground.js, compartido con colors.ts, para no
      // duplicar valores a mano.
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          backgroundColor: splashBackground.light,
          dark: {
            backgroundColor: splashBackground.dark,
          },
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'SOSAgro necesita acceso a tu galería para adjuntar imágenes a las encuestas.',
          cameraPermission: 'SOSAgro necesita acceso a la cámara para fotografiar cultivos y evidencias.',
        },
      ],
      [
        'expo-audio',
        {
          microphonePermission: 'SOSAgro necesita acceso al micrófono para grabar respuestas de voz en campo.',
        },
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: 'SOSAgro necesita acceso a tu ubicación GPS para registrar las coordenadas de la unidad productiva.',
          locationWhenInUsePermission: 'SOSAgro necesita acceso a tu ubicación GPS para registrar las coordenadas de la unidad productiva.',
          isIosBackgroundLocationEnabled: false,
        },
      ],
      [
        '@sentry/react-native/expo',
        {
          organization: 'instituto-tecnologico-metropol',
          // Corregido en el spec 80 (2026-08-29): el slug real del proyecto
          // en Sentry es 'react-native', no 'sosagro-mobile'. Con el slug
          // equivocado, la subida de sourcemaps fallaba en Gradle con
          // "sentry reported an error: One or more projects are invalid
          // (http status: 400)" — incluso con el binario de sentry-cli ya
          // resuelto correctamente.
          project: 'react-native',
        },
      ],
      [
        'expo-build-properties',
        {
          android: { usesCleartextTraffic },
        },
      ],
    ],
    extra: {
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
      eas: {
        projectId: 'a9915da7-c235-4537-a1a0-de31ac73d63b',
      },
    },
    owner: 'santiagosuarez219',
  };
};
