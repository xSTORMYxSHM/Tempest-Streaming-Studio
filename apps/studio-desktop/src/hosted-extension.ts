import type { ExtensionRelayOptions } from '@tempest/bridge';

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
