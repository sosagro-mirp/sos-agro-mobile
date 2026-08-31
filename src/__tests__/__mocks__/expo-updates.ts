// Minimal mock of expo-updates for unit tests. Tests that need specific
// behaviour (canal, updateId, resultados de check/fetch) should override these
// via jest.mock/jest.doMock at the top of their own file — see
// `e2e-080-otaUpdates.test.ts`. This default keeps anything that touches
// `getOtaStatus()` incidentally (e.g. `sentry.ts`) from throwing when OTA
// isn't the point of the test.

export const isEnabled = true;
export const channel = 'preview';
export const runtimeVersion = '1.0.0';
export const updateId = null;
export const createdAt = null;
export const isEmbeddedLaunch = true;

export const checkForUpdateAsync = jest.fn().mockResolvedValue({ isAvailable: false });
export const fetchUpdateAsync = jest.fn().mockResolvedValue({ isNew: false });
export const reloadAsync = jest.fn().mockResolvedValue(undefined);
