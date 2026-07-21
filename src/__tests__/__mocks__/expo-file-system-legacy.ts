// Minimal mock of expo-file-system/legacy for unit tests. Tests that need
// specific FileSystem behaviour (e.g. MediaUploadService) should override
// these via jest.mock at the top of their own file; this default keeps
// logger.ts (and anything else touching the FS incidentally) from throwing
// "Cannot read properties of undefined" noise when the FS isn't the point
// of the test.

export const documentDirectory = 'file:///mock-documents/';

export const EncodingType = {
  UTF8: 'utf8',
  Base64: 'base64',
} as const;

export const FileSystemUploadType = { BINARY_CONTENT: 'BINARY_CONTENT' } as const;

export const getInfoAsync = jest.fn().mockResolvedValue({ exists: false });
export const makeDirectoryAsync = jest.fn().mockResolvedValue(undefined);
export const readAsStringAsync = jest.fn().mockResolvedValue('');
export const writeAsStringAsync = jest.fn().mockResolvedValue(undefined);
export const readDirectoryAsync = jest.fn().mockResolvedValue([]);
export const deleteAsync = jest.fn().mockResolvedValue(undefined);
export const uploadAsync = jest.fn().mockResolvedValue({ status: 200, body: '' });
