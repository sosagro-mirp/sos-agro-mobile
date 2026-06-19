export function isLocalId(id: string): boolean {
  return id.startsWith('local_');
}
