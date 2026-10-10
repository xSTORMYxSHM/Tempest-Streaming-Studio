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
      if (timedOut) throw new Error(`Service request timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`);
      throw error;
    } finally {
      clearTimeout(timer);
      upstreamSignal?.removeEventListener('abort', abortFromUpstream);
    }
  }) as typeof fetch;
}
