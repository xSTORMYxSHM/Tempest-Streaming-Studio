export async function readResponseBuffer(response: Response, maximumBytes: number, requestedTimeoutMs?: number): Promise<Buffer> {
  if (!Number.isInteger(maximumBytes) || maximumBytes < 1) throw new Error('Response size limit must be a positive integer.');
  const declaredBytes = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredBytes) && declaredBytes > maximumBytes) throw new Error('Response exceeds the permitted size.');
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const timeoutMs = requestedTimeoutMs === undefined
    ? undefined
    : Math.min(60_000, Math.max(100, Number(requestedTimeoutMs) || 10_000));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeoutError = () => new Error(`Service response timed out after ${Math.ceil((timeoutMs || 10_000) / 1000)} seconds.`);
  const timedRead = timeoutMs === undefined
    ? undefined
    : new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(timeoutError());
        reader.cancel().catch(() => undefined);
      }, timeoutMs);
      timer.unref?.();
    });
  try {
    while (true) {
      const { done, value } = await (timedRead ? Promise.race([reader.read(), timedRead]) : reader.read());
      if (timedOut) throw timeoutError();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error('Response exceeds the permitted size.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    if (timer) clearTimeout(timer);
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes);
}

export async function readResponseJson<T>(response: Response, maximumBytes: number, requestedTimeoutMs = 10_000): Promise<T> {
  const bytes = await readResponseBuffer(response, maximumBytes, requestedTimeoutMs);
  return JSON.parse(bytes.toString('utf8')) as T;
}
