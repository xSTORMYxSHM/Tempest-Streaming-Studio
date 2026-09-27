const twitchLoginPattern = /^[a-z0-9_]{1,25}$/;

export function normalizeTwitchLogin(value: unknown): string {
  const login = String(value || '').trim().toLowerCase();
  if (!twitchLoginPattern.test(login)) throw new Error('Connect the broadcaster Twitch account before opening Stream Together.');
  return login;
}

export function streamTogetherUrl(value: unknown): string {
  const login = normalizeTwitchLogin(value);
  return `https://www.twitch.tv/popout/${encodeURIComponent(login)}/guest-star`;
}

export function isTwitchWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && (url.hostname === 'twitch.tv' || url.hostname.endsWith('.twitch.tv'));
  } catch {
    return false;
  }
}

export function chromeCompatibleUserAgent(chromeVersion: string): string {
  const major = String(chromeVersion || '').split('.')[0];
  if (!/^\d{2,3}$/.test(major)) throw new Error('Studio could not determine its Chromium version.');
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}
