export const PROJECT_EXTENSION = '.phosphor';
export const MAGIC_HEADER = 'PHOSPHOR';

/**
 * Bundles project data into a binary blob.
 * @param {Object} settings - JSON-serializable settings and charMap
 * @param {ArrayBuffer} originalBuffer - Raw bytes of the source image
 * @param {ArrayBuffer} paintBuffer - Raw bytes of the edit layer PNG
 * @returns {Promise<Blob>}
 */
export async function bundleProject(settings, originalBuffer, paintBuffer) {
  const json = JSON.stringify(settings);
  const jsonBuffer = new TextEncoder().encode(json);
  
  const header = new TextEncoder().encode(MAGIC_HEADER); // 8 bytes
  const lengths = new Uint32Array([
    jsonBuffer.byteLength,
    originalBuffer.byteLength,
    paintBuffer.byteLength
  ]);

  return new Blob([
    header,
    lengths,
    jsonBuffer,
    originalBuffer,
    paintBuffer
  ], { type: 'application/octet-stream' });
}

/**
 * Unbundles a project file into its constituent parts.
 * @param {File|Blob} file 
 * @returns {Promise<{settings: Object, originalBuffer: ArrayBuffer, paintBuffer: ArrayBuffer}>}
 */
export async function unbundleProject(file) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  
  const header = new TextDecoder().decode(buffer.slice(0, 8));
  if (header !== MAGIC_HEADER) {
    throw new Error('Not a valid Phosphor project file');
  }

  const jsonLen = view.getUint32(8, true);
  const origLen = view.getUint32(12, true);
  const paintLen = view.getUint32(16, true);

  let offset = 20;
  const jsonBuffer = buffer.slice(offset, offset + jsonLen);
  offset += jsonLen;
  const originalBuffer = buffer.slice(offset, offset + origLen);
  offset += origLen;
  const paintBuffer = buffer.slice(offset, offset + paintLen);

  const settings = JSON.parse(new TextDecoder().decode(jsonBuffer));
  
  return {
    settings,
    originalBuffer,
    paintBuffer,
    hasPaint: paintLen > 0
  };
}
