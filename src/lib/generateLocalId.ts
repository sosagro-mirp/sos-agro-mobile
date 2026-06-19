// UUID v4 generation without crypto.randomUUID() (not available in all Hermes builds).
// Uses 4 Math.random() calls × ~52 bits = ~208 bits of randomness, well above
// the 122 bits UUID v4 requires. Collision probability is negligible for field use.
function uuidv4(): string {
  const hex = (n: number) => Math.floor(n).toString(16).padStart(2, '0');
  const r = () => Math.random() * 0xffffffff;
  const a = r(), b = r(), c = r(), d = r();

  const p1 = hex(a >>> 16).padStart(4, '0') + hex(a & 0xffff).padStart(4, '0');
  const p2 = hex(b >>> 16).padStart(4, '0');
  // Set version 4: top nibble of p3 = 4
  const p3 = (0x4000 | ((b & 0x0fff))).toString(16);
  // Set variant: top 2 bits of p4 = 10
  const p4 = (0x8000 | ((c >>> 16) & 0x3fff)).toString(16);
  const p5 =
    hex(c & 0xffff).padStart(4, '0') +
    hex(d >>> 16).padStart(4, '0') +
    hex(d & 0xffff).padStart(4, '0');

  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

export function generateLocalId(prefix: 'session' | 'survey' | 'farmer'): string {
  return `local_${prefix}_${uuidv4()}`;
}
