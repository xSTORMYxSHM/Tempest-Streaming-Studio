export function userFacingIpcErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || 'Studio could not complete that action.');
  const cleaned = raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();
  return cleaned || 'Studio could not complete that action.';
}
