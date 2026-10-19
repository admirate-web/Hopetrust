/** Top-level MP4 box types, in file order. */
export function boxes(file: Buffer): string[] {
  const types: string[] = [];
  for (let at = 0; at + 8 <= file.length; ) {
    let size = file.readUInt32BE(at);
    if (size === 1) size = Number(file.readBigUInt64BE(at + 8));
    types.push(file.toString('latin1', at + 4, at + 8));
    if (size < 8) break;
    at += size;
  }
  return types;
}
