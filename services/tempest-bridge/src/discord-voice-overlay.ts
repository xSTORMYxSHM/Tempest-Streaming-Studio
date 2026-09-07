import { createReadStream } from 'node:fs';
import { ServerResponse } from 'node:http';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DiscordVoiceParticipant {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  bot: boolean;
  self: boolean;
  mute: boolean;
  deaf: boolean;
  speaking: boolean;
}

export interface DiscordVoiceProfile {
  userId: string;
  username?: string;
  discordDisplayName?: string;
  avatarUrl?: string;
  bot?: boolean;
  self?: boolean;
  displayName?: string;
  idleUri?: string;
  speakingUri?: string;
  visible: boolean;
  order: number;
  accent?: string;
  createdAt?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  lastChannelName?: string;
  lastGuildName?: string;
  updatedAt?: string;
}

export interface DiscordVoiceOverlaySettings {
  schemaVersion: 1;
  enabled: boolean;
  layout: 'horizontal' | 'vertical' | 'grid';
  avatarSize: number;
  gap: number;
  showNames: boolean;
  showStatusIcons: boolean;
  hideSelf: boolean;
  hideBots: boolean;
  inactiveOpacity: number;
  speakingScale: number;
  speakingAccent: string;
  transitionMs: number;
  updatedAt?: string;
}

interface DiscordVoiceDocument {
  schemaVersion: 1;
  settings: DiscordVoiceOverlaySettings;
  profiles: DiscordVoiceProfile[];
}

interface DiscordVoiceStateInput {
  connected?: unknown;
  channelId?: unknown;
  channelName?: unknown;
  guildName?: unknown;
  participants?: unknown;
  error?: unknown;
}

const defaultSettings: DiscordVoiceOverlaySettings = {
  schemaVersion: 1,
  enabled: true,
  layout: 'horizontal',
  avatarSize: 160,
  gap: 24,
  showNames: true,
  showStatusIcons: true,
  hideSelf: false,
  hideBots: true,
  inactiveOpacity: 0.72,
  speakingScale: 1.08,
  speakingAccent: '#54F2EB',
  transitionMs: 140
};

const mediaTypes: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif'
};

const overlayPage = String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tempest Discord Voice Overlay</title><style>
:root{--size:160px;--gap:24px;--inactive:.72;--scale:1.08;--accent:#54f2eb;--speed:140ms;color-scheme:dark}*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent;font-family:Inter,Segoe UI,sans-serif}#stage{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:4vh 4vw;gap:var(--gap)}#stage.vertical{flex-direction:column;align-items:flex-end;justify-content:center}#stage.grid{display:grid;grid-template-columns:repeat(auto-fit,var(--size));align-content:end;justify-content:center}.person{position:relative;display:flex;width:var(--size);flex:0 0 var(--size);flex-direction:column;align-items:center;gap:9px;opacity:var(--inactive);transform-origin:50% 100%;transition:opacity var(--speed) ease,transform var(--speed) ease,filter var(--speed) ease}.person.speaking{opacity:1;transform:scale(var(--scale));filter:drop-shadow(0 0 14px color-mix(in srgb,var(--person-accent,var(--accent)) 72%,transparent))}.portrait{position:relative;width:var(--size);height:var(--size);overflow:hidden;border:3px solid rgba(255,255,255,.17);border-radius:24%;background:linear-gradient(145deg,#162631,#071018);box-shadow:0 10px 34px rgba(0,0,0,.38);transition:border-color var(--speed) ease,box-shadow var(--speed) ease}.speaking .portrait{border-color:var(--person-accent,var(--accent));box-shadow:0 0 0 3px color-mix(in srgb,var(--person-accent,var(--accent)) 22%,transparent),0 10px 34px rgba(0,0,0,.42)}.portrait img{width:100%;height:100%;display:block;object-fit:contain}.initials{position:absolute;inset:0;display:grid;place-items:center;color:#ecfbff;font-size:calc(var(--size)*.3);font-weight:850}.portrait img:not([src=""])+.initials{display:none}.name{max-width:calc(var(--size)*1.25);padding:6px 11px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(5,13,19,.82);color:#f3fbff;font-size:calc(var(--size)*.09);font-weight:750;line-height:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.status{position:absolute;right:-6px;top:-7px;display:flex;gap:4px}.status i{display:grid;min-width:25px;height:25px;padding:0 5px;place-items:center;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:#111d25;color:#ff8b9a;font:800 10px Consolas,monospace}.hidden{display:none!important}</style></head><body><main id="stage" aria-live="polite"></main><script>(()=>{
const stage=document.getElementById('stage');let settings={};let participants=[];const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function initials(v){return String(v||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()}function apply(next){settings={...settings,...next};const root=document.documentElement.style;root.setProperty('--size',(settings.avatarSize||160)+'px');root.setProperty('--gap',(settings.gap||24)+'px');root.setProperty('--inactive',String(settings.inactiveOpacity??.72));root.setProperty('--scale',String(settings.speakingScale??1.08));root.setProperty('--accent',settings.speakingAccent||'#54f2eb');root.setProperty('--speed',(settings.transitionMs||140)+'ms');stage.className=settings.layout||'horizontal';render()}function media(p,kind){if(kind==='speaking'&&p.speaking&&p.speakingAssigned)return './discord-voice/media/'+encodeURIComponent(p.id)+'/speaking?v='+encodeURIComponent(p.profileUpdatedAt||'');if(p.idleAssigned)return './discord-voice/media/'+encodeURIComponent(p.id)+'/idle?v='+encodeURIComponent(p.profileUpdatedAt||'');return p.avatarUrl||''}function render(){const visible=(settings.enabled===false?[]:participants).filter(p=>p.visible!==false&&!(settings.hideSelf&&p.self)&&!(settings.hideBots&&p.bot)).sort((a,b)=>(a.order-b.order)||a.displayName.localeCompare(b.displayName));stage.innerHTML=visible.map(p=>{const src=media(p,p.speaking?'speaking':'idle');const states=[];if(settings.showStatusIcons&&p.mute)states.push('<i title="Muted">MUTE</i>');if(settings.showStatusIcons&&p.deaf)states.push('<i title="Deafened">DEAF</i>');return '<article class="person '+(p.speaking?'speaking':'')+'" style="--person-accent:'+esc(p.accent||settings.speakingAccent)+'"><div class="portrait">'+(src?'<img src="'+esc(src)+'" alt="" onerror="this.remove()">':'')+'<span class="initials">'+esc(initials(p.displayName))+'</span><span class="status">'+states.join('')+'</span></div>'+(settings.showNames?'<strong class="name">'+esc(p.displayName)+'</strong>':'')+'</article>'}).join('')}const events=new EventSource('./discord-voice/events');events.addEventListener('init',e=>{const d=JSON.parse(e.data);participants=d.participants||[];apply(d.settings||{})});events.addEventListener('settings',e=>apply(JSON.parse(e.data)));events.addEventListener('state',e=>{participants=JSON.parse(e.data).participants||[];render()});events.onerror=()=>{};
})();</script></body></html>`;

function integer(value: unknown, name: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  return parsed;
}

function finite(value: unknown, name: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  return parsed;
}

function cleanText(value: unknown, name: string, maximum = 100): string {
  if (typeof value !== 'string') throw new Error(`${name} must be text.`);
  const result = value.trim();
  if (!result || result.length > maximum) throw new Error(`${name} must contain between 1 and ${maximum} characters.`);
  return result;
}

function optionalUri(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !value.startsWith('file:')) throw new Error(`${name} must be a local file URI.`);
  const extension = path.extname(fileURLToPath(value)).toLowerCase();
  if (!mediaTypes[extension]) throw new Error(`${name} must be a PNG, JPG, GIF, WebP, or AVIF image.`);
  return value;
}

function optionalText(value: unknown, name: string, maximum = 100): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return cleanText(value, name, maximum);
}

function optionalTimestamp(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error(`${name} must be an ISO timestamp.`);
  return new Date(value).toISOString();
}

function discordAvatarUrl(value: unknown): string | undefined {
  return typeof value === 'string' && /^https:\/\/(cdn|media)\.discordapp\.(com|net)\//i.test(value) ? value : undefined;
}

function validateSettings(input: DiscordVoiceOverlaySettings): DiscordVoiceOverlaySettings {
  if (typeof input.enabled !== 'boolean' || typeof input.showNames !== 'boolean' || typeof input.showStatusIcons !== 'boolean' || typeof input.hideSelf !== 'boolean' || typeof input.hideBots !== 'boolean') throw new Error('Discord Voice boolean settings are invalid.');
  if (!['horizontal', 'vertical', 'grid'].includes(input.layout)) throw new Error('layout must be horizontal, vertical, or grid.');
  if (!/^#[0-9a-f]{6}$/i.test(input.speakingAccent)) throw new Error('speakingAccent must be a six-digit hex color.');
  return {
    ...input,
    schemaVersion: 1,
    avatarSize: integer(input.avatarSize, 'avatarSize', 48, 420),
    gap: integer(input.gap, 'gap', 0, 160),
    transitionMs: integer(input.transitionMs, 'transitionMs', 0, 2000),
    inactiveOpacity: finite(input.inactiveOpacity, 'inactiveOpacity', 0.1, 1),
    speakingScale: finite(input.speakingScale, 'speakingScale', 1, 1.5),
    speakingAccent: input.speakingAccent.toUpperCase()
  };
}

function validateParticipant(input: unknown): DiscordVoiceParticipant {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Each Discord voice participant must be an object.');
  const source = input as Record<string, unknown>;
  const id = cleanText(source.id, 'participant id', 128);
  const username = cleanText(source.username || source.displayName, 'participant username', 100);
  const displayName = cleanText(source.displayName || username, 'participant display name', 100);
  const avatarUrl = discordAvatarUrl(source.avatarUrl);
  return { id, username, displayName, ...(avatarUrl ? { avatarUrl } : {}), bot: source.bot === true, self: source.self === true, mute: source.mute === true, deaf: source.deaf === true, speaking: source.speaking === true };
}

export class TempestDiscordVoiceOverlay {
  private settings = structuredClone(defaultSettings);
  private profiles = new Map<string, DiscordVoiceProfile>();
  private participants = new Map<string, DiscordVoiceParticipant>();
  private clients = new Set<ServerResponse>();
  private previewing = false;
  private connection = { connected: false, channelId: '', channelName: '', guildName: '', error: '' };
  private readonly documentPath: string;

  constructor(private readonly dataDirectory: string) { this.documentPath = path.join(dataDirectory, 'discord-voice-overlay.json'); }

  async initialize(): Promise<void> {
    try {
      const stored = JSON.parse(await readFile(this.documentPath, 'utf8')) as Partial<DiscordVoiceDocument>;
      this.settings = validateSettings({ ...defaultSettings, ...(stored.settings || {}) });
      for (const entry of stored.profiles || []) {
        try { const profile = this.validateProfile(entry.userId, entry); this.profiles.set(profile.userId, profile); } catch { /* Ignore one invalid legacy entry. */ }
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && error instanceof SyntaxError) throw error; }
    await this.persist();
  }

  page(): string { return overlayPage; }

  connect(response: ServerResponse): void {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    this.clients.add(response);
    this.write(response, 'init', { settings: this.settings, participants: this.mergedParticipants() });
    response.on('close', () => this.clients.delete(response));
  }

  async updateSettings(patch: unknown): Promise<DiscordVoiceOverlaySettings> {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Discord Voice settings must be an object.');
    const source = patch as Record<string, unknown>;
    const allowed = new Set(['enabled', 'layout', 'avatarSize', 'gap', 'showNames', 'showStatusIcons', 'hideSelf', 'hideBots', 'inactiveOpacity', 'speakingScale', 'speakingAccent', 'transitionMs']);
    for (const key of Object.keys(source)) if (!allowed.has(key)) throw new Error(`${key} is not a Discord Voice setting.`);
    this.settings = validateSettings({ ...this.settings, ...source, updatedAt: new Date().toISOString() } as DiscordVoiceOverlaySettings);
    await this.persist();
    this.broadcast('settings', this.settings);
    return structuredClone(this.settings);
  }

  async updateProfile(userIdValue: unknown, patch: unknown): Promise<DiscordVoiceProfile> {
    const userId = cleanText(userIdValue, 'Discord user id', 128);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Discord participant design must be an object.');
    const source = patch as Record<string, unknown>;
    const allowed = new Set(['displayName', 'idleUri', 'speakingUri', 'visible', 'order', 'accent']);
    for (const key of Object.keys(source)) if (!allowed.has(key)) throw new Error(`${key} is not a Discord participant design setting.`);
    const now = new Date().toISOString();
    const previous = this.profiles.get(userId) || { userId, visible: true, order: this.profiles.size, createdAt: now };
    const profile = this.validateProfile(userId, { ...previous, ...source, updatedAt: now });
    this.profiles.set(userId, profile);
    await this.persist();
    this.broadcastState();
    return structuredClone(profile);
  }

  async resetProfile(userIdValue: unknown): Promise<boolean> {
    const userId = cleanText(userIdValue, 'Discord user id', 128);
    const previous = this.profiles.get(userId);
    if (!previous) return false;
    const profile = this.validateProfile(userId, {
      userId,
      username: previous.username,
      discordDisplayName: previous.discordDisplayName,
      avatarUrl: previous.avatarUrl,
      bot: previous.bot,
      self: previous.self,
      visible: true,
      order: previous.order,
      createdAt: previous.createdAt,
      firstSeenAt: previous.firstSeenAt,
      lastSeenAt: previous.lastSeenAt,
      lastChannelName: previous.lastChannelName,
      lastGuildName: previous.lastGuildName,
      updatedAt: new Date().toISOString()
    });
    this.profiles.set(userId, profile);
    await this.persist();
    this.broadcastState();
    return true;
  }

  async removeProfile(userIdValue: unknown): Promise<boolean> {
    const removed = this.profiles.delete(cleanText(userIdValue, 'Discord user id', 128));
    if (removed) { await this.persist(); this.broadcastState(); }
    return removed;
  }

  async setState(input: DiscordVoiceStateInput): Promise<void> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Discord Voice state must be an object.');
    if (input.participants !== undefined && !Array.isArray(input.participants)) throw new Error('Discord Voice participants must be an array.');
    this.previewing = false;
    this.connection = {
      connected: input.connected === true,
      channelId: typeof input.channelId === 'string' ? input.channelId.slice(0, 128) : '',
      channelName: typeof input.channelName === 'string' ? input.channelName.slice(0, 100) : '',
      guildName: typeof input.guildName === 'string' ? input.guildName.slice(0, 100) : '',
      error: typeof input.error === 'string' ? input.error.slice(0, 500) : ''
    };
    this.participants.clear();
    const now = new Date().toISOString();
    for (const item of input.participants || []) {
      const participant = validateParticipant(item);
      this.participants.set(participant.id, participant);
      const previous = this.profiles.get(participant.id);
      this.profiles.set(participant.id, this.validateProfile(participant.id, {
        ...(previous || { userId: participant.id, visible: true, order: this.profiles.size, createdAt: now }),
        username: participant.username,
        discordDisplayName: participant.displayName,
        avatarUrl: participant.avatarUrl,
        bot: participant.bot,
        self: participant.self,
        firstSeenAt: previous?.firstSeenAt || now,
        lastSeenAt: now,
        lastChannelName: this.connection.channelName || previous?.lastChannelName,
        lastGuildName: this.connection.guildName || previous?.lastGuildName
      }));
    }
    if (this.participants.size) await this.persist();
    this.broadcastState();
  }

  setSpeaking(userIdValue: unknown, speaking: unknown): void {
    const userId = cleanText(userIdValue, 'Discord user id', 128);
    if (typeof speaking !== 'boolean') throw new Error('speaking must be boolean.');
    const participant = this.participants.get(userId);
    if (!participant || participant.speaking === speaking) return;
    participant.speaking = speaking;
    this.broadcastState();
  }

  preview(): void {
    this.previewing = true;
    this.connection = { connected: true, channelId: 'preview', channelName: 'Creator Lounge', guildName: 'Tempest Preview', error: '' };
    this.participants = new Map([
      ['preview-streamer', { id: 'preview-streamer', username: 'streamer', displayName: 'Streamer', bot: false, self: true, mute: false, deaf: false, speaking: false }],
      ['preview-guest', { id: 'preview-guest', username: 'guest', displayName: 'Speaking Guest', bot: false, self: false, mute: false, deaf: false, speaking: true }],
      ['preview-friend', { id: 'preview-friend', username: 'friend', displayName: 'Muted Friend', bot: false, self: false, mute: true, deaf: false, speaking: false }]
    ]);
    this.broadcastState();
  }

  clearPreview(): void {
    if (!this.previewing) return;
    this.previewing = false;
    this.connection = { connected: false, channelId: '', channelName: '', guildName: '', error: '' };
    this.participants.clear();
    this.broadcastState();
  }

  async serveMedia(userIdValue: unknown, kind: unknown, response: ServerResponse): Promise<boolean> {
    const userId = cleanText(userIdValue, 'Discord user id', 128);
    if (kind !== 'idle' && kind !== 'speaking') throw new Error('Discord participant media kind must be idle or speaking.');
    const profile = this.profiles.get(userId);
    const uri = kind === 'speaking' ? profile?.speakingUri : profile?.idleUri;
    if (!uri) return false;
    const filePath = fileURLToPath(uri);
    const details = await stat(filePath);
    if (!details.isFile()) return false;
    const contentType = mediaTypes[path.extname(filePath).toLowerCase()];
    if (!contentType) return false;
    response.statusCode = 200;
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Length', details.size);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    createReadStream(filePath).pipe(response);
    return true;
  }

  status(url: string): Record<string, unknown> {
    return { state: this.previewing ? 'preview' : this.connection.connected ? 'connected' : 'ready', url, connectedClients: this.clients.size, previewing: this.previewing, connection: { ...this.connection }, settings: structuredClone(this.settings), profiles: [...this.profiles.values()].map((entry) => structuredClone(entry)), participants: this.mergedParticipants(), guests: this.guestLibrary(), savedGuestCount: this.profiles.size };
  }

  close(): void { for (const client of this.clients) client.end(); this.clients.clear(); }

  private validateProfile(userId: string, source: Partial<DiscordVoiceProfile>): DiscordVoiceProfile {
    const username = optionalText(source.username, 'Discord username', 100);
    const discordDisplayName = optionalText(source.discordDisplayName, 'Discord display name', 100);
    const avatarUrl = discordAvatarUrl(source.avatarUrl);
    const displayName = source.displayName === undefined || source.displayName === '' ? undefined : cleanText(source.displayName, 'profile display name', 100);
    const accent = source.accent === undefined || source.accent === '' ? undefined : String(source.accent).toUpperCase();
    if (accent && !/^#[0-9a-f]{6}$/i.test(accent)) throw new Error('profile accent must be a six-digit hex color.');
    const idleUri = optionalUri(source.idleUri, 'idleUri');
    const speakingUri = optionalUri(source.speakingUri, 'speakingUri');
    const createdAt = optionalTimestamp(source.createdAt, 'createdAt');
    const firstSeenAt = optionalTimestamp(source.firstSeenAt, 'firstSeenAt');
    const lastSeenAt = optionalTimestamp(source.lastSeenAt, 'lastSeenAt');
    const updatedAt = optionalTimestamp(source.updatedAt, 'updatedAt');
    return {
      userId,
      ...(username ? { username } : {}),
      ...(discordDisplayName ? { discordDisplayName } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(source.bot !== undefined ? { bot: source.bot === true } : {}),
      ...(source.self !== undefined ? { self: source.self === true } : {}),
      ...(displayName ? { displayName } : {}),
      ...(idleUri ? { idleUri } : {}),
      ...(speakingUri ? { speakingUri } : {}),
      visible: source.visible !== false,
      order: integer(source.order ?? 0, 'profile order', 0, 999),
      ...(accent ? { accent } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(firstSeenAt ? { firstSeenAt } : {}),
      ...(lastSeenAt ? { lastSeenAt } : {}),
      ...(optionalText(source.lastChannelName, 'last channel name') ? { lastChannelName: optionalText(source.lastChannelName, 'last channel name') } : {}),
      ...(optionalText(source.lastGuildName, 'last guild name') ? { lastGuildName: optionalText(source.lastGuildName, 'last guild name') } : {}),
      ...(updatedAt ? { updatedAt } : {})
    };
  }

  private mergedParticipants(): Array<DiscordVoiceParticipant & { visible: boolean; order: number; accent?: string; idleAssigned: boolean; speakingAssigned: boolean; profileUpdatedAt?: string }> {
    return [...this.participants.values()].map((participant) => {
      const profile = this.profiles.get(participant.id);
      return { ...structuredClone(participant), displayName: profile?.displayName || participant.displayName, visible: profile?.visible !== false, order: profile?.order ?? 500, ...(profile?.accent ? { accent: profile.accent } : {}), idleAssigned: Boolean(profile?.idleUri), speakingAssigned: Boolean(profile?.speakingUri), ...(profile?.updatedAt ? { profileUpdatedAt: profile.updatedAt } : {}) };
    });
  }

  private guestLibrary(): Array<Record<string, unknown>> {
    const active = this.mergedParticipants().map((participant) => ({
      ...participant,
      inChannel: true,
      ...(this.profiles.get(participant.id)?.firstSeenAt ? { firstSeenAt: this.profiles.get(participant.id)?.firstSeenAt } : {}),
      ...(this.profiles.get(participant.id)?.lastSeenAt ? { lastSeenAt: this.profiles.get(participant.id)?.lastSeenAt } : {}),
      ...(this.profiles.get(participant.id)?.lastChannelName ? { lastChannelName: this.profiles.get(participant.id)?.lastChannelName } : {}),
      ...(this.profiles.get(participant.id)?.lastGuildName ? { lastGuildName: this.profiles.get(participant.id)?.lastGuildName } : {})
    }));
    const activeIds = new Set(active.map((participant) => participant.id));
    const saved = [...this.profiles.values()].filter((profile) => !activeIds.has(profile.userId)).map((profile) => ({
      id: profile.userId,
      username: profile.username || '',
      displayName: profile.displayName || profile.discordDisplayName || profile.username || `Discord user …${profile.userId.slice(-4)}`,
      ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
      bot: profile.bot === true,
      self: profile.self === true,
      mute: false,
      deaf: false,
      speaking: false,
      inChannel: false,
      visible: profile.visible !== false,
      order: profile.order,
      ...(profile.accent ? { accent: profile.accent } : {}),
      idleAssigned: Boolean(profile.idleUri),
      speakingAssigned: Boolean(profile.speakingUri),
      ...(profile.updatedAt ? { profileUpdatedAt: profile.updatedAt } : {}),
      ...(profile.firstSeenAt ? { firstSeenAt: profile.firstSeenAt } : {}),
      ...(profile.lastSeenAt ? { lastSeenAt: profile.lastSeenAt } : {}),
      ...(profile.lastChannelName ? { lastChannelName: profile.lastChannelName } : {}),
      ...(profile.lastGuildName ? { lastGuildName: profile.lastGuildName } : {})
    }));
    return [...active, ...saved];
  }

  private broadcastState(): void { this.broadcast('state', { participants: this.mergedParticipants() }); }
  private broadcast(event: string, payload: unknown): void { for (const client of this.clients) this.write(client, event, payload); }
  private write(response: ServerResponse, event: string, payload: unknown): void { if (!response.destroyed) response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); }

  private async persist(): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    const temporaryPath = `${this.documentPath}.tmp`;
    const document: DiscordVoiceDocument = { schemaVersion: 1, settings: this.settings, profiles: [...this.profiles.values()] };
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, this.documentPath);
  }
}
