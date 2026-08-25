import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TwitchExtensionClaims {
  channel_id: string;
  exp: number;
  iat?: number;
  is_unlinked?: boolean;
  opaque_user_id: string;
  role: 'viewer' | 'moderator' | 'broadcaster';
  user_id?: string;
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('JWT contains invalid base64url data.');
  return Buffer.from(value.replaceAll('-', '+').replaceAll('_', '/'), 'base64');
}

function decodeJson(value: string, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(decodeBase64Url(value).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`JWT ${label} is not a JSON object.`);
  }
}

export function decodeTwitchSecrets(values: string[]): Buffer[] {
  if (!values.length) throw new Error('At least one Twitch Extension shared secret is required.');
  return values.map((value) => {
    const normalized = value.trim();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) throw new Error('Twitch Extension secrets must be base64 encoded.');
    const secret = Buffer.from(normalized, 'base64');
    if (secret.length < 16) throw new Error('Twitch Extension secrets must decode to at least 16 bytes.');
    return secret;
  });
}

export function verifyTwitchExtensionJwt(token: string, secrets: readonly Buffer[], now = Date.now()): TwitchExtensionClaims {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('A valid Twitch Extension JWT is required.');
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodeJson(headerPart, 'header');
  if (header.alg !== 'HS256') throw new Error('Twitch Extension JWT must use HS256.');
  const signature = decodeBase64Url(signaturePart);
  const signingInput = `${headerPart}.${payloadPart}`;
  const verified = secrets.some((secret) => {
    const expected = createHmac('sha256', secret).update(signingInput).digest();
    return expected.length === signature.length && timingSafeEqual(expected, signature);
  });
  if (!verified) throw new Error('Twitch Extension JWT signature is invalid.');

  const payload = decodeJson(payloadPart, 'payload');
  const currentSeconds = Math.floor(now / 1000);
  if (!Number.isInteger(payload.exp) || Number(payload.exp) < currentSeconds - 30) throw new Error('Twitch Extension JWT is expired.');
  if (payload.iat !== undefined && (!Number.isInteger(payload.iat) || Number(payload.iat) > currentSeconds + 60)) throw new Error('Twitch Extension JWT issue time is invalid.');
  if (typeof payload.channel_id !== 'string' || !/^\d{1,30}$/.test(payload.channel_id)) throw new Error('Twitch Extension JWT channel_id is invalid.');
  if (!['viewer', 'moderator', 'broadcaster'].includes(String(payload.role))) throw new Error('Twitch Extension JWT role is not permitted.');
  if (typeof payload.opaque_user_id !== 'string' || !/^[AU][A-Za-z0-9_-]{1,127}$/.test(payload.opaque_user_id)) throw new Error('Twitch Extension JWT opaque_user_id is invalid.');
  if (payload.user_id !== undefined && (typeof payload.user_id !== 'string' || !/^\d{1,30}$/.test(payload.user_id))) throw new Error('Twitch Extension JWT user_id is invalid.');

  return payload as unknown as TwitchExtensionClaims;
}
