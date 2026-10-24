interface ProcessOutputStream {
  on(event: 'error', listener: (error: NodeJS.ErrnoException) => void): unknown;
}

/**
 * Electron GUI builds can outlive the shell or developer tool that launched
 * them. Once that parent closes its stdout/stderr pipe, a later console write
 * emits EPIPE. Treat that closed launcher pipe as harmless so it cannot open a
 * recurring main-process error dialog.
 */
export function guardGuiProcessOutput(
  streams: Array<ProcessOutputStream | null | undefined>,
  onUnexpectedError: (error: NodeJS.ErrnoException) => void = () => {}
): void {
  for (const stream of streams) {
    stream?.on('error', (error) => {
      if (error.code !== 'EPIPE') onUnexpectedError(error);
    });
  }
}
