export function boundedFetch(request: typeof fetch = fetch, requestedTimeoutMs = 10_000): typeof fetch {
  const timeoutMs = Math.min(60_000, Math.max(100, Number(requestedTimeoutMs) || 10_000));
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    const controller = new AbortController();
    const upstreamSignal = init.signal;
    let timedOut = false;
    const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
    if (upstreamSignal?.aborted) abortFromUpstream();
    else upstreamSignal?.addEventListener('abort', abortFromUpstream, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    timer.unref?.();
    try {
      return await request(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (timedOut) throw new Error(`Remote service request timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`);
      throw error;
    } finally {
      clearTimeout(timer);
      upstreamSignal?.removeEventListener('abort', abortFromUpstream);
    }
  }) as typeof fetch;
}

export async function readBoundedJsonResponse<T>(
  response: Response,
  maximumBytes: number,
  requestedTimeoutMs = 10_000
): Promise<T> {
  if (!Number.isInteger(maximumBytes) || maximumBytes < 1) throw new Error('Response size limit must be a positive integer.');
  const declaredBytes = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredBytes) && declaredBytes > maximumBytes) throw new Error('Provider response exceeded the size limit.');
  if (!response.body) return JSON.parse('') as T;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let timedOut = false;
  const timeoutMs = Math.min(60_000, Math.max(100, Number(requestedTimeoutMs) || 10_000));
  const timeoutError = () => new Error(`Remote service response timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedRead = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(timeoutError());
      reader.cancel().catch(() => undefined);
    }, timeoutMs);
    timer.unref?.();
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timedRead]);
      if (timedOut) throw timeoutError();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error('Provider response exceeded the size limit.');
      }
      chunks.push(value);
    }
  } finally {
    if (timer) clearTimeout(timer);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
