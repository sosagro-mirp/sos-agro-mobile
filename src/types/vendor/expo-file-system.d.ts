declare module 'expo-file-system' {
  export const documentDirectory: string | null;
  export const cacheDirectory: string | null;
  export const bundleDirectory: string | null;
  export const bundledAssets: string | null;

  export enum EncodingType {
    UTF8 = 'utf8',
    Base64 = 'base64',
  }

  export interface FileInfo {
    exists: boolean;
    uri: string;
    size?: number;
    isDirectory?: boolean;
    modificationTime?: number;
    md5?: string;
  }

  export interface ReadingOptions {
    encoding?: EncodingType | 'utf8' | 'base64';
    position?: number;
    length?: number;
  }

  export interface WritingOptions {
    encoding?: EncodingType | 'utf8' | 'base64';
  }

  export interface DeletingOptions {
    idempotent?: boolean;
  }

  export interface MakeDirectoryOptions {
    intermediates?: boolean;
  }

  export function getInfoAsync(
    fileUri: string,
    options?: { md5?: boolean; size?: boolean }
  ): Promise<FileInfo>;

  export function readAsStringAsync(
    fileUri: string,
    options?: ReadingOptions
  ): Promise<string>;

  export function writeAsStringAsync(
    fileUri: string,
    contents: string,
    options?: WritingOptions
  ): Promise<void>;

  export function deleteAsync(
    fileUri: string,
    options?: DeletingOptions
  ): Promise<void>;

  export function moveAsync(options: { from: string; to: string }): Promise<void>;

  export function copyAsync(options: { from: string; to: string }): Promise<void>;

  export function makeDirectoryAsync(
    fileUri: string,
    options?: MakeDirectoryOptions
  ): Promise<void>;

  export function readDirectoryAsync(fileUri: string): Promise<string[]>;

  export enum FileSystemUploadType {
    BINARY_CONTENT = 0,
    MULTIPART = 1,
  }

  export interface UploadOptions {
    headers?: Record<string, string>;
    httpMethod?: 'POST' | 'PUT' | 'PATCH';
    uploadType?: FileSystemUploadType;
    fieldName?: string;
    mimeType?: string;
    parameters?: Record<string, string>;
  }

  export interface UploadResult {
    body: string;
    headers: Record<string, string>;
    mimeType: string | null;
    status: number;
  }

  export function uploadAsync(
    url: string,
    fileUri: string,
    options?: UploadOptions,
  ): Promise<UploadResult>;
}
