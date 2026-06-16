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
      url: 'https://u.expo.dev/YOUR_PROJECT_ID',
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
      permissions: ['INTERNET', 'ACCESS_NETWORK_STATE'],
      versionCode,
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: ['expo-router', 'expo-sqlite'],
    extra: {
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    },
  };
};
