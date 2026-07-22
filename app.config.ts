import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const [major, minor, patch] = (config.version ?? '1.0.0').split('.').map(Number);
  const versionCode = major * 10000 + minor * 100 + patch;

  return {
    ...config,
    name: 'SOS Agro 4C',
    slug: 'sosagro-characterization',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    scheme: 'sosagro',
    runtimeVersion: { policy: 'appVersion' },
    updates: {
      url: 'https://u.expo.dev/a9915da7-c235-4537-a1a0-de31ac73d63b',
      enabled: true,
      fallbackToCacheTimeout: 0,
    },
    ios: {
      supportsTablet: false,
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
        'MICROPHONE',
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
      [
        'expo-image-picker',
        {
          photosPermission: 'SOSAgro necesita acceso a tu galería para adjuntar imágenes a las encuestas.',
          cameraPermission: 'SOSAgro necesita acceso a la cámara para fotografiar cultivos y evidencias.',
        },
      ],
      [
        'expo-av',
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
