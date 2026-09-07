import type { ExtensionRelayOptions } from '@tempest/bridge';

export const OFFICIAL_HOSTED_EBS_URL = 'https://signal.tempestmainframe.com';

export interface HostedExtensionCredentials {
  schemaVersion: 1;
  ebsBaseUrl: string;
  installationId: string;
  channelId: string;
  channelLogin: string;
  relayToken: string;
  pairedAt: string;
}

export interface HostedExtensionStatus {
  paired: boolean;
  defaultEbsBaseUrl: string;
  ebsBaseUrl?: string;
  installationId?: string;
  channel?: { id: string; login: string };
  pairedAt?: string;
  credentialStorage: 'windows-encrypted' | 'unavailable';
  lastError?: string;
}

export function validateHostedEbsUrl(value: unknown): string {
  const url = new URL(String(value || '').trim());
  const localDevelopment = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localDevelopment) throw new Error('The hosted Extension service must use HTTPS.');
  if (url.username || url.password || url.search || url.hash) throw new Error('The hosted Extension URL must not contain credentials, a query, or a fragment.');
  if (url.pathname !== '/' && url.pathname !== '') throw new Error('Enter only the hosted Extension service origin, without an API path.');
  return url.origin;
}

export function validateHostedExtensionCredentials(value: unknown): HostedExtensionCredentials {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Hosted Extension credentials are invalid.');
  const source = value as Partial<HostedExtensionCredentials>;
  const ebsBaseUrl = validateHostedEbsUrl(source.ebsBaseUrl);
  const installationId = String(source.installationId || '').trim();
  const channelId = String(source.channelId || '').trim();
  const channelLogin = String(source.channelLogin || '').trim();
  const relayToken = String(source.relayToken || '').trim();
  const pairedAt = String(source.pairedAt || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(installationId)) throw new Error('Hosted Extension installation ID is invalid.');
  if (!/^\d{1,30}$/.test(channelId)) throw new Error('Hosted Extension channel ID is invalid.');
  if (!/^[a-z0-9_]{1,80}$/i.test(channelLogin)) throw new Error('Hosted Extension channel login is invalid.');
  if (relayToken.length < 32 || relayToken.length > 256 || /[\r\n\0]/.test(relayToken)) throw new Error('Hosted Extension relay credential is invalid.');
  if (!Number.isFinite(Date.parse(pairedAt))) throw new Error('Hosted Extension pairing timestamp is invalid.');
  return { schemaVersion: 1, ebsBaseUrl, installationId, channelId, channelLogin, relayToken, pairedAt };
}

export function describeHostedExtensionPairingFailure(status: number, result: { error?: unknown; code?: unknown }, officialService: boolean, officialTwitchAuthorization: boolean): string {
  const error = typeof result.error === 'string' ? result.error.trim() : '';
  if (status === 403 && result.code === 'TWITCH_CLIENT_NOT_ALLOWED') {
    if (officialService && officialTwitchAuthorization) {
      return 'Tempest Signal could not accept the official Twitch sign-in because its application allowlist is temporarily out of sync. This is a service issue, not an account problem. Please try again later.';
    }
    if (officialService) {
      return 'The public Extension requires the built-in Tempest Twitch application. Use the official Twitch sign-in, reconnect your broadcaster account, then connect your channel again.';
    }
  }
  return error || `Hosted Extension pairing failed with ${status}.`;
}

export function hostedExtensionRelayOptions(credentials: HostedExtensionCredentials): ExtensionRelayOptions {
  const url = new URL(credentials.ebsBaseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/v1/studio';
  return {
    url: url.href,
    token: credentials.relayToken,
    channelId: credentials.channelId,
    allowUnauthorizedLocalTls: false
  };
}

export async function syncHostedExtensionPanelDesign(
  credentialsValue: HostedExtensionCredentials,
  panelDesign: unknown,
  fetchImplementation: typeof fetch = fetch
): Promise<void> {
  const credentials = validateHostedExtensionCredentials(credentialsValue);
  const response = await fetchImplementation(`${credentials.ebsBaseUrl}/v1/installations/current/panel-design`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${credentials.relayToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ panelDesign })
  });
  if (response.ok) return;
  const result = await response.json().catch(() => ({})) as { error?: unknown };
  const detail = typeof result.error === 'string' ? result.error.trim() : '';
  throw new Error(detail || `Hosted Panel design sync failed with ${response.status}.`);
}
