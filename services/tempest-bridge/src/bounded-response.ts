export async function readBoundedResponseBody(response: Response, maximumBytes: number): Promise<Buffer> {
  if (!Number.isInteger(maximumBytes) || maximumBytes < 1) throw new Error('Response size limit must be a positive integer.');
  const declaredBytes = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredBytes) && declaredBytes > maximumBytes) throw new Error('Provider response exceeded the size limit.');
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error('Provider response exceeded the size limit.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes);
}
