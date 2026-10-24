// A .phosphor file's bytes, laid out as projectIO.writeProject lays them: 'PHOSPHOR', three
// little-endian lengths (JSON, image, paint), then the JSON, the image, the paint and the base
// pixels (whose length is in the JSON as baseLength). For older and hostile layouts writeProject
// can't produce.
export function buildProjectFile({ json, image, paint = null, base = null }) {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const parts = [new TextEncoder().encode('PHOSPHOR'), new Uint8Array(new Uint32Array([jsonBytes.length, image.length, paint?.length ?? 0]).buffer), jsonBytes, image, paint, base].filter(Boolean);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
