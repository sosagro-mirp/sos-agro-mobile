// Global Jest setup — runs after the test framework is installed.
// Add any global mocks or polyfills here.

// Silence React Native's "act" warnings in unit tests
global.console.warn = (msg: string, ...args: unknown[]) => {
  if (typeof msg === 'string' && msg.includes('act(')) return;
  console.warn(msg, ...args);
};
