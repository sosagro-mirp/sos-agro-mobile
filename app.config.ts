import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SOS Agro 4C',
  slug: 'sosagro-characterization',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'sosagro',
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
  },
  web: {
    favicon: './assets/favicon.png',
  },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  },
});
