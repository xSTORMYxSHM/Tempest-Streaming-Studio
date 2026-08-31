import { ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TempestNormalizedTwitchEvent } from '@tempest/contracts';

export interface TempestEmoteWallSettings {
  schemaVersion: 1;
  enabled: boolean;
  maxActive: number;
  lifetimeMs: number;
  sizePx: number;
  speed: number;
  includeAnimated: boolean;
  includeGifs: boolean;
  enablePyramids: boolean;
  pyramidWindowMs: number;
  pyramidCooldownMs: number;
  enableSevenTv: boolean;
  enableBttv: boolean;
  enableFfz: boolean;
  providerOrder: string;
  updatedAt?: string;
}

export interface TempestEmoteWallItem {
  id: string;
  name: string;
  url: string;
  viewerName: string;
  occurredAt: string;
  provider?: EmoteProvider;
}

interface TempestEmotePyramidCelebration {
  id: string;
  name: string;
  url: string;
  viewerNames: string[];
  occurredAt: string;
  provider?: EmoteProvider;
}

type EmoteProvider = 'seventv' | 'bttv' | 'ffz';
type ProviderState = 'disabled' | 'waiting' | 'ready' | 'error';

interface ProviderEmote {
  name: string;
  sourceUrl: string;
  provider: EmoteProvider;
  animated: boolean;
}

interface ProviderStatus {
  id: EmoteProvider;
  state: ProviderState;
  emoteCount: number;
  lastUpdatedAt?: string;
  error?: string;
}

const defaultSettings: TempestEmoteWallSettings = {
  schemaVersion: 1,
  enabled: true,
  maxActive: 18,
  lifetimeMs: 10000,
  sizePx: 96,
  speed: 100,
  includeAnimated: true,
  includeGifs: true,
  enablePyramids: true,
  pyramidWindowMs: 20000,
  pyramidCooldownMs: 30000,
  enableSevenTv: false,
  enableBttv: false,
  enableFfz: false,
  providerOrder: 'seventv,bttv,ffz'
};

const providerIds: EmoteProvider[] = ['seventv', 'bttv', 'ffz'];
const providerHosts: Record<EmoteProvider, string[]> = {
  seventv: ['7tv.io'],
  bttv: ['api.betterttv.net'],
  ffz: ['api.frankerfacez.com']
};
const mediaHosts = new Set(['cdn.7tv.app', 'cdn.betterttv.net', 'cdn.frankerfacez.com']);
const providerResponseLimit = 4 * 1024 * 1024;
const mediaCacheLimit = 48 * 1024 * 1024;

const emoteWallPage = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tempest Studio Emote Wall</title>
<style>*{box-sizing:border-box}html,body,#wall{width:100%;height:100%;margin:0;overflow:hidden;background:transparent}#wall{position:relative}.emote{position:absolute;left:0;top:0;display:block;object-fit:contain;filter:drop-shadow(0 6px 8px rgba(0,0,0,.48));opacity:0;pointer-events:none;user-select:none;will-change:transform,opacity;transition:opacity .18s ease}.emote.visible{opacity:1}.emote.leaving{opacity:0;transition-duration:.35s}</style></head>
<body><main id="wall" aria-hidden="true"></main><script>(()=>{const wall=document.getElementById('wall');let settings={enabled:true,maxActive:18,lifetimeMs:10000,sizePx:96,speed:100,includeAnimated:true,includeGifs:true};const sprites=new Map;let previous=performance.now();const random=(minimum,maximum)=>minimum+Math.random()*(maximum-minimum);function apply(next){settings={...settings,...next};if(!settings.enabled)clear();trim()}function trim(){while(sprites.size>settings.maxActive)remove(sprites.keys().next().value)}function remove(id){const sprite=sprites.get(id);if(!sprite)return;clearTimeout(sprite.timer);sprites.delete(id);sprite.node.classList.add('leaving');sprite.node.classList.remove('visible');setTimeout(()=>sprite.node.remove(),380)}function add(item){if(!settings.enabled||!item?.id||!item?.url)return;remove(item.id);const size=Math.max(24,settings.sizePx*random(.78,1.18));const node=document.createElement('img');node.className='emote';node.alt='';node.draggable=false;node.referrerPolicy='no-referrer';node.width=Math.round(size);node.height=Math.round(size);node.addEventListener('error',()=>remove(item.id),{once:true});node.src=item.url;node.style.width=size+'px';node.style.height=size+'px';const maximumX=Math.max(0,innerWidth-size),maximumY=Math.max(0,innerHeight-size);const angle=random(0,Math.PI*2),velocity=Math.max(25,settings.speed)*random(.72,1.28);const sprite={node,x:random(0,maximumX),y:random(0,maximumY),vx:Math.cos(angle)*velocity,vy:Math.sin(angle)*velocity,rotation:random(-12,12),spin:random(-34,34),size,timer:0};sprites.set(item.id,sprite);wall.append(node);requestAnimationFrame(()=>node.classList.add('visible'));const age=Math.max(0,Date.now()-new Date(item.occurredAt).getTime());sprite.timer=setTimeout(()=>remove(item.id),Math.max(500,settings.lifetimeMs-age));trim()}function clear(){for(const id of [...sprites.keys()])remove(id)}function frame(now){const elapsed=Math.min(.05,(now-previous)/1000);previous=now;for(const sprite of sprites.values()){sprite.x+=sprite.vx*elapsed;sprite.y+=sprite.vy*elapsed;sprite.rotation+=sprite.spin*elapsed;const maximumX=Math.max(0,innerWidth-sprite.size),maximumY=Math.max(0,innerHeight-sprite.size);if(sprite.x<=0){sprite.x=0;sprite.vx=Math.abs(sprite.vx)}else if(sprite.x>=maximumX){sprite.x=maximumX;sprite.vx=-Math.abs(sprite.vx)}if(sprite.y<=0){sprite.y=0;sprite.vy=Math.abs(sprite.vy)}else if(sprite.y>=maximumY){sprite.y=maximumY;sprite.vy=-Math.abs(sprite.vy)}sprite.node.style.transform='translate3d('+sprite.x+'px,'+sprite.y+'px,0) rotate('+sprite.rotation+'deg)'}}requestAnimationFrame(function animate(now){frame(now);requestAnimationFrame(animate)});const events=new EventSource('./emote-wall/events');events.addEventListener('init',event=>{const data=JSON.parse(event.data);apply(data.settings||{});clear();for(const item of data.items||[])add(item)});events.addEventListener('settings',event=>apply(JSON.parse(event.data)));events.addEventListener('emote',event=>add(JSON.parse(event.data)));events.addEventListener('remove',event=>remove(JSON.parse(event.data).id));events.addEventListener('clear',clear);events.onerror=()=>{};})();</script></body></html>`;

const emotePyramidStyle = String.raw`<style>
.pyramid-celebration{position:absolute;inset:0;z-index:20;display:grid;place-items:center;overflow:hidden;pointer-events:none;animation:pyramid-scene 4.8s ease both}.pyramid-aura{position:absolute;width:min(58vw,760px);aspect-ratio:1;border:3px solid rgba(84,242,235,.72);border-radius:50%;box-shadow:0 0 45px rgba(84,242,235,.8),inset 0 0 70px rgba(141,116,232,.32);animation:pyramid-aura 4.4s ease-out both}.pyramid-stack{position:relative;display:grid;gap:clamp(4px,.7vh,10px);place-items:center;padding:clamp(24px,4vw,58px);filter:drop-shadow(0 18px 24px rgba(0,0,0,.58));animation:pyramid-stack 4.5s cubic-bezier(.16,.9,.18,1) both}.pyramid-row{display:flex;justify-content:center;gap:clamp(5px,.7vw,12px)}.pyramid-row img{width:clamp(54px,7.5vw,130px);height:clamp(54px,7.5vw,130px);object-fit:contain;filter:drop-shadow(0 0 14px rgba(84,242,235,.68));animation:pyramid-emote .72s cubic-bezier(.18,1.5,.35,1) both}.pyramid-row:nth-child(2) img{animation-delay:.08s}.pyramid-row:nth-child(3) img{animation-delay:.16s}.pyramid-row:nth-child(4) img{animation-delay:.24s}.pyramid-row:nth-child(5) img{animation-delay:.32s}.pyramid-title{position:absolute;left:50%;bottom:clamp(35px,7vh,90px);transform:translateX(-50%);color:#ecffff;text-align:center;text-shadow:0 0 16px #16d9d7,0 3px 10px #000;font:800 clamp(18px,2.1vw,34px)/1.1 Inter,"Segoe UI",sans-serif;letter-spacing:.16em;white-space:nowrap;animation:pyramid-title 4.4s ease both}.pyramid-title small{display:block;margin-top:8px;color:#9ffcf6;font:700 clamp(9px,.75vw,13px)/1 Consolas,monospace;letter-spacing:.2em}@keyframes pyramid-scene{0%,100%{opacity:0}8%,82%{opacity:1}}@keyframes pyramid-aura{0%{opacity:0;transform:scale(.12) rotate(0)}25%{opacity:1}100%{opacity:0;transform:scale(1.45) rotate(135deg)}}@keyframes pyramid-stack{0%{opacity:0;transform:scale(.35) rotate(-8deg)}22%{opacity:1;transform:scale(1.08) rotate(1deg)}35%,72%{transform:scale(1) rotate(0)}100%{opacity:0;transform:scale(1.35) translateY(-5vh)}}@keyframes pyramid-emote{from{opacity:0;transform:translateY(35px) scale(.2) rotate(-18deg)}to{opacity:1;transform:none}}@keyframes pyramid-title{0%,22%,100%{opacity:0;transform:translate(-50%,18px)}32%,78%{opacity:1;transform:translate(-50%,0)}}
</style>`;

const emotePyramidScript = String.raw`<script>(()=>{const wall=document.getElementById('wall');let active;function celebrate(item){if(!item?.url)return;active?.remove();const scene=document.createElement('section');scene.className='pyramid-celebration';scene.innerHTML='<i class="pyramid-aura"></i><div class="pyramid-stack"></div><div class="pyramid-title">EMOTE PYRAMID<small></small></div>';const stack=scene.querySelector('.pyramid-stack');for(const count of [1,2,3,2,1]){const row=document.createElement('div');row.className='pyramid-row';for(let index=0;index<count;index+=1){const image=document.createElement('img');image.alt='';image.draggable=false;image.referrerPolicy='no-referrer';image.src=item.url;row.append(image)}stack.append(row)}const names=(item.viewerNames||[]).slice(0,4);scene.querySelector('.pyramid-title small').textContent=names.length?'BUILT BY '+names.join(' + ').toUpperCase():'CHAT COMBO COMPLETE';wall.append(scene);active=scene;setTimeout(()=>{if(active===scene)active=undefined;scene.remove()},5000)}window.tempestPyramid=celebrate;window.tempestPyramidClear=()=>{active?.remove();active=undefined}})();</script>`;

function integer(value: unknown, name: string, minimum: number, maximum: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  return number;
}

function validate(input: TempestEmoteWallSettings): TempestEmoteWallSettings {
  for (const key of ['enabled', 'includeAnimated', 'includeGifs', 'enablePyramids', 'enableSevenTv', 'enableBttv', 'enableFfz'] as const) if (typeof input[key] !== 'boolean') throw new Error(`${key} must be boolean.`);
  const order = String(input.providerOrder || '').split(',').map((entry) => entry.trim()).filter(Boolean);
  if (order.length !== providerIds.length || new Set(order).size !== providerIds.length || order.some((entry) => !providerIds.includes(entry as EmoteProvider))) throw new Error('providerOrder must contain seventv, bttv, and ffz exactly once.');
  return {
    ...input,
    schemaVersion: 1,
    maxActive: integer(input.maxActive, 'maxActive', 1, 50),
    lifetimeMs: integer(input.lifetimeMs, 'lifetimeMs', 3000, 30000),
    sizePx: integer(input.sizePx, 'sizePx', 32, 240),
    speed: integer(input.speed, 'speed', 25, 300),
    pyramidWindowMs: integer(input.pyramidWindowMs, 'pyramidWindowMs', 5000, 60000),
    pyramidCooldownMs: integer(input.pyramidCooldownMs, 'pyramidCooldownMs', 5000, 300000),
    providerOrder: order.join(',')
  };
}

function normalizedHttpsUrl(value: unknown): string | undefined {
  const text = String(value || '');
  return httpsUrl(text.startsWith('//') ? `https:${text}` : text);
}

function providerEnabled(settings: TempestEmoteWallSettings, provider: EmoteProvider): boolean {
  return provider === 'seventv' ? settings.enableSevenTv : provider === 'bttv' ? settings.enableBttv : settings.enableFfz;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

function parseBttv(payload: unknown): ProviderEmote[] {
  const root = record(payload);
  const entries = Array.isArray(payload) ? payload : [...list(root?.channelEmotes), ...list(root?.sharedEmotes)];
  return entries.flatMap((value) => {
    const item = record(value); const id = String(item?.id || ''); const name = String(item?.code || '');
    if (!/^[A-Za-z0-9]+$/.test(id) || !name) return [];
    const animated = String(item?.imageType || '').toLowerCase() === 'gif';
    return [{ name, provider: 'bttv' as const, animated, sourceUrl: `https://cdn.betterttv.net/emote/${id}/3x` }];
  });
}

function parseFfz(payload: unknown): ProviderEmote[] {
  const sets = record(record(payload)?.sets);
  const entries = Object.values(sets || {}).flatMap((set) => list(record(set)?.emoticons));
  return entries.flatMap((value) => {
    const item = record(value); const name = String(item?.name || ''); const urls = record(item?.urls);
    const sourceUrl = normalizedHttpsUrl(urls?.['4'] || urls?.['2'] || urls?.['1']);
    if (!name || !sourceUrl) return [];
    return [{ name, provider: 'ffz' as const, animated: false, sourceUrl }];
  });
}

function parseSevenTv(payload: unknown): ProviderEmote[] {
  const root = record(payload);
  const set = record(root?.emote_set) || root;
  return list(set?.emotes).flatMap((value) => {
    const item = record(value); const data = record(item?.data); const host = record(data?.host); const name = String(item?.name || '');
    const files = list(host?.files).map(record).filter(Boolean) as Record<string, unknown>[];
    const selected = [...files].reverse().find((file) => /\.(avif|webp|gif|png)$/i.test(String(file.name || '')));
    const sourceUrl = normalizedHttpsUrl(`${String(host?.url || '')}/${String(selected?.name || '')}`);
    if (!name || !sourceUrl) return [];
    return [{ name, provider: 'seventv' as const, animated: Number(selected?.frame_count || 1) > 1, sourceUrl }];
  });
}

function httpsUrl(value: unknown): string | undefined {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : undefined;
  } catch { return undefined; }
}

export class TempestEmoteWall {
  private settings = structuredClone(defaultSettings);
  private items: TempestEmoteWallItem[] = [];
  private clients = new Set<ServerResponse>();
  private removalTimers = new Map<string, NodeJS.Timeout>();
  private readonly documentPath: string;
  private channelId = '';
  private providerCatalogs = new Map<EmoteProvider, Map<string, ProviderEmote>>();
  private mediaSources = new Map<string, ProviderEmote>();
  private mediaCache = new Map<string, { bytes: Buffer; contentType: string }>();
  private mediaCacheBytes = 0;
  private providerRefresh?: Promise<void>;
  private providerStatuses = new Map<EmoteProvider, ProviderStatus>();
  private pyramidProgress?: { signature: string; step: number; lastAt: number; item: TempestEmoteWallItem; viewerNames: string[] };
  private pyramidCompleted = 0;
  private lastPyramidAt = 0;
  private lastPyramid?: TempestEmotePyramidCelebration;

  constructor(private readonly dataDirectory: string, private readonly fetchImplementation: typeof fetch = fetch) {
    this.documentPath = path.join(dataDirectory, 'emote-wall.json');
    for (const id of providerIds) this.providerStatuses.set(id, { id, state: 'disabled', emoteCount: 0 });
  }

  async initialize(): Promise<void> {
    try { this.settings = validate({ ...defaultSettings, ...JSON.parse(await readFile(this.documentPath, 'utf8')) }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && error instanceof SyntaxError) throw error; }
    this.resetProviderStatuses();
    await this.persist();
  }

  page(): string {
    return emoteWallPage
      .replace('</head>', `${emotePyramidStyle}</head>`)
      .replace("events.addEventListener('clear',clear);", "events.addEventListener('pyramid',event=>window.tempestPyramid?.(JSON.parse(event.data)));events.addEventListener('clear',()=>{clear();window.tempestPyramidClear?.()});")
      .replace('</body>', `${emotePyramidScript}</body>`);
  }

  connect(response: ServerResponse): void {
    this.prune();
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    this.clients.add(response);
    this.write(response, 'init', { settings: this.settings, items: this.items });
    response.on('close', () => this.clients.delete(response));
  }

  push(event: TempestNormalizedTwitchEvent): TempestEmoteWallItem[] {
    if (!this.settings.enabled || event.topic !== 'viewer.chat.message') return [];
    if (/^\d+$/.test(event.channel.id) && event.channel.id !== this.channelId) void this.setChannel(event.channel.id);
    const fragments = Array.isArray(event.payload.fragments) ? event.payload.fragments : [];
    const created: TempestEmoteWallItem[] = [];
    fragments.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      const fragment = entry as Record<string, unknown>;
      const type = String(fragment.type || '');
      let url: string | undefined;
      let provider: EmoteProvider | undefined;
      if (type === 'emote' && fragment.emote && typeof fragment.emote === 'object' && !Array.isArray(fragment.emote)) {
        const emote = fragment.emote as Record<string, unknown>;
        const id = String(emote.id || '');
        if (!/^[A-Za-z0-9_]+$/.test(id)) return;
        const formats = Array.isArray(emote.format) ? emote.format.map(String) : [];
        const animated = this.settings.includeAnimated && formats.includes('animated');
        url = `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/${animated ? 'animated' : 'static'}/dark/3.0`;
      } else if (type === 'gif' && this.settings.includeGifs && fragment.gif && typeof fragment.gif === 'object' && !Array.isArray(fragment.gif)) {
        url = httpsUrl((fragment.gif as Record<string, unknown>).url);
      }
      if (url) {
        const item = this.createItem(event, index, fragment, url);
        this.addItem(item); created.push(structuredClone(item));
        return;
      }
      if (type !== 'text') return;
      const tokens = String(fragment.text || '').split(/\s+/).filter(Boolean);
      tokens.forEach((token, tokenIndex) => {
        const match = this.resolveProviderEmote(token);
        if (!match || (match.animated && !this.settings.includeAnimated)) return;
        provider = match.provider;
        const mediaId = createHash('sha256').update(`${provider}:${match.sourceUrl}`).digest('hex').slice(0, 32);
        this.mediaSources.set(mediaId, match);
        const item = this.createItem(event, index * 1000 + tokenIndex, { text: token }, `/emote-wall/media/${mediaId}`, provider);
        this.addItem(item); created.push(structuredClone(item));
      });
    });
    this.trackPyramid(event, created);
    while (this.items.length > this.settings.maxActive) this.remove(this.items[0].id);
    return created;
  }

  private createItem(event: TempestNormalizedTwitchEvent, index: number, fragment: Record<string, unknown>, url: string, provider?: EmoteProvider): TempestEmoteWallItem {
    return {
        id: `${event.id}:${index}:${globalThis.crypto.randomUUID()}`,
        name: String(fragment.text || 'Emote').slice(0, 80),
        url,
        viewerName: (event.viewer?.displayName || event.viewer?.login || 'Viewer').slice(0, 80),
        occurredAt: event.occurredAt,
        ...(provider ? { provider } : {})
    };
  }

  private addItem(item: TempestEmoteWallItem): void {
    this.items.push(item);
    this.broadcast('emote', item);
    this.scheduleRemoval(item);
  }

  preview(): TempestEmoteWallItem[] {
    const occurredAt = new Date().toISOString();
    const providerSamples = (this.settings.providerOrder.split(',') as EmoteProvider[]).flatMap((id) => {
      const sample = this.providerCatalogs.get(id)?.keys().next().value as string | undefined;
      return sample ? [sample] : [];
    });
    return this.push({
      schemaVersion: 1,
      id: globalThis.crypto.randomUUID(),
      topic: 'viewer.chat.message',
      occurredAt,
      source: 'twitch',
      channel: { id: this.channelId || 'studio-preview' },
      viewer: { id: 'studio-operator', displayName: 'Sample Viewer', roles: ['subscriber'] },
      payload: {
        messageId: globalThis.crypto.randomUUID(),
        text: ['Kappa', 'TwitchUnity', ...providerSamples].join(' '),
        fragments: [
          { type: 'emote', text: 'Kappa', emote: { id: '25', format: ['static'] } },
          { type: 'emote', text: 'TwitchUnity', emote: { id: '196892', format: ['static'] } },
          ...(providerSamples.length ? [{ type: 'text', text: providerSamples.join(' ') }] : [])
        ]
      }
    });
  }

  previewPyramid(): TempestEmotePyramidCelebration {
    if (!this.settings.enabled || !this.settings.enablePyramids) throw new Error('Enable Emote Wall pyramids before previewing the celebration.');
    const celebration: TempestEmotePyramidCelebration = {
      id: globalThis.crypto.randomUUID(),
      name: 'Kappa',
      url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/static/dark/3.0',
      viewerNames: ['Studio Preview'],
      occurredAt: new Date().toISOString()
    };
    this.broadcast('pyramid', celebration);
    return structuredClone(celebration);
  }

  async update(patch: unknown): Promise<TempestEmoteWallSettings> {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Emote Wall settings must be an object.');
    const source = patch as Record<string, unknown>;
    const allowed = new Set(['enabled', 'maxActive', 'lifetimeMs', 'sizePx', 'speed', 'includeAnimated', 'includeGifs', 'enablePyramids', 'pyramidWindowMs', 'pyramidCooldownMs', 'enableSevenTv', 'enableBttv', 'enableFfz', 'providerOrder']);
    for (const key of Object.keys(source)) if (!allowed.has(key)) throw new Error(`${key} is not an Emote Wall setting.`);
    this.settings = validate({ ...this.settings, ...source, updatedAt: new Date().toISOString() } as TempestEmoteWallSettings);
    if (!this.settings.enabled) this.clear();
    if (!this.settings.enablePyramids) this.pyramidProgress = undefined;
    while (this.items.length > this.settings.maxActive) this.remove(this.items[0].id);
    for (const item of this.items) this.scheduleRemoval(item);
    await this.persist();
    this.broadcast('settings', this.settings);
    this.resetProviderStatuses();
    await this.refreshProviders();
    return structuredClone(this.settings);
  }

  clear(): void {
    for (const timer of this.removalTimers.values()) clearTimeout(timer);
    this.removalTimers.clear();
    this.items = [];
    this.pyramidProgress = undefined;
    this.broadcast('clear', {});
  }

  status(url: string): Record<string, unknown> {
    this.prune();
    return {
      state: this.settings.enabled ? 'ready' : 'disabled', url, connectedClients: this.clients.size,
      activeCount: this.items.length, settings: structuredClone(this.settings), items: this.items.map((item) => structuredClone(item)),
      pyramid: { enabled: this.settings.enablePyramids, building: Boolean(this.pyramidProgress), step: this.pyramidProgress?.step || 0, completed: this.pyramidCompleted, lastCompletedAt: this.lastPyramid?.occurredAt },
      providerCatalogCount: [...this.providerCatalogs.values()].reduce((total, catalog) => total + catalog.size, 0),
      providers: providerIds.map((id) => structuredClone(this.providerStatuses.get(id)))
    };
  }

  async setChannel(channelId: string): Promise<void> {
    const next = /^\d+$/.test(String(channelId || '')) ? String(channelId) : '';
    if (next === this.channelId) return;
    this.channelId = next;
    this.providerCatalogs.clear();
    this.mediaSources.clear();
    this.resetProviderStatuses();
    await this.refreshProviders();
  }

  async refreshProviders(): Promise<void> {
    if (this.providerRefresh) return this.providerRefresh;
    this.providerRefresh = this.performProviderRefresh().finally(() => { this.providerRefresh = undefined; });
    return this.providerRefresh;
  }

  async serveMedia(id: string, response: ServerResponse): Promise<boolean> {
    if (!/^[a-f0-9]{32}$/.test(id)) return false;
    const cached = this.mediaCache.get(id);
    if (cached) {
      this.mediaCache.delete(id); this.mediaCache.set(id, cached);
      response.statusCode = 200;
      response.setHeader('Content-Type', cached.contentType);
      response.setHeader('Cache-Control', 'private, max-age=21600');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.end(cached.bytes);
      return true;
    }
    const emote = this.mediaSources.get(id);
    if (!emote) return false;
    const source = new URL(emote.sourceUrl);
    if (source.protocol !== 'https:' || !mediaHosts.has(source.hostname)) return false;
    const fetched = await this.fetchWithLimit(source.href, mediaHosts, providerResponseLimit);
    const contentType = String(fetched.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'].includes(contentType)) throw new Error(`${emote.provider} returned unsupported media.`);
    const bytes = Buffer.from(await fetched.arrayBuffer());
    if (bytes.length > providerResponseLimit) throw new Error(`${emote.provider} media exceeded the size limit.`);
    this.cacheMedia(id, bytes, contentType);
    response.statusCode = 200;
    response.setHeader('Content-Type', contentType);
    response.setHeader('Cache-Control', 'private, max-age=21600');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(bytes);
    return true;
  }

  close(): void { this.clear(); for (const client of this.clients) client.end(); this.clients.clear(); }

  private resetProviderStatuses(): void {
    for (const id of providerIds) this.providerStatuses.set(id, {
      id,
      state: !providerEnabled(this.settings, id) ? 'disabled' : this.channelId ? 'waiting' : 'waiting',
      emoteCount: this.providerCatalogs.get(id)?.size || 0
    });
  }

  private trackPyramid(event: TempestNormalizedTwitchEvent, created: TempestEmoteWallItem[]): void {
    if (!this.settings.enablePyramids) { this.pyramidProgress = undefined; return; }
    const textTokens = String(event.payload.text || '').trim().split(/\s+/).filter(Boolean);
    const sameEmote = created.length >= 1 && created.length <= 3 && created.every((item) => item.url === created[0].url);
    const qualifies = sameEmote && textTokens.length === created.length;
    const now = Date.now();
    if (!qualifies) { this.pyramidProgress = undefined; return; }
    const item = created[0];
    const signature = item.url;
    const counts = [1, 2, 3, 2, 1];
    const expired = !this.pyramidProgress || now - this.pyramidProgress.lastAt > this.settings.pyramidWindowMs;
    const expected = expired ? 1 : counts[this.pyramidProgress!.step];
    if (expired || this.pyramidProgress?.signature !== signature || created.length !== expected) {
      this.pyramidProgress = created.length === 1 ? { signature, step: 1, lastAt: now, item, viewerNames: [item.viewerName] } : undefined;
      return;
    }
    this.pyramidProgress.step += 1;
    this.pyramidProgress.lastAt = now;
    if (!this.pyramidProgress.viewerNames.includes(item.viewerName)) this.pyramidProgress.viewerNames.push(item.viewerName);
    if (this.pyramidProgress.step < counts.length) return;
    if (now - this.lastPyramidAt >= this.settings.pyramidCooldownMs) {
      const celebration: TempestEmotePyramidCelebration = {
        id: globalThis.crypto.randomUUID(), name: item.name, url: item.url,
        viewerNames: this.pyramidProgress.viewerNames.slice(0, 8), occurredAt: new Date().toISOString(),
        ...(item.provider ? { provider: item.provider } : {})
      };
      this.lastPyramidAt = now;
      this.lastPyramid = celebration;
      this.pyramidCompleted += 1;
      this.broadcast('pyramid', celebration);
    }
    this.pyramidProgress = undefined;
  }

  private resolveProviderEmote(name: string): ProviderEmote | undefined {
    for (const id of this.settings.providerOrder.split(',') as EmoteProvider[]) {
      const emote = this.providerCatalogs.get(id)?.get(name);
      if (emote) return emote;
    }
    return undefined;
  }

  private async performProviderRefresh(): Promise<void> {
    for (const id of providerIds) {
      if (!providerEnabled(this.settings, id)) {
        this.providerCatalogs.delete(id);
        this.providerStatuses.set(id, { id, state: 'disabled', emoteCount: 0 });
        continue;
      }
      if (!this.channelId) {
        this.providerCatalogs.delete(id);
        this.providerStatuses.set(id, { id, state: 'waiting', emoteCount: 0 });
        continue;
      }
      try {
        const emotes = await this.loadProvider(id, this.channelId);
        const catalog = new Map<string, ProviderEmote>();
        for (const emote of emotes) if (!catalog.has(emote.name)) catalog.set(emote.name, emote);
        this.providerCatalogs.set(id, catalog);
        this.providerStatuses.set(id, { id, state: 'ready', emoteCount: catalog.size, lastUpdatedAt: new Date().toISOString() });
      } catch (error) {
        this.providerCatalogs.delete(id);
        this.providerStatuses.set(id, { id, state: 'error', emoteCount: 0, error: error instanceof Error ? error.message.slice(0, 160) : 'Provider refresh failed.' });
      }
    }
  }

  private async loadProvider(id: EmoteProvider, channelId: string): Promise<ProviderEmote[]> {
    const endpoints: Record<EmoteProvider, string[]> = {
      seventv: ['https://7tv.io/v3/emote-sets/global', `https://7tv.io/v3/users/twitch/${channelId}`],
      bttv: ['https://api.betterttv.net/3/cached/emotes/global', `https://api.betterttv.net/3/cached/users/twitch/${channelId}`],
      ffz: ['https://api.frankerfacez.com/v1/set/global', `https://api.frankerfacez.com/v1/room/id/${channelId}`]
    };
    const parsed: ProviderEmote[] = [];
    for (const endpoint of endpoints[id]) {
      try {
        const response = await this.fetchWithLimit(endpoint, new Set(providerHosts[id]), providerResponseLimit);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > providerResponseLimit) throw new Error(`${id} catalog exceeded the size limit.`);
        const payload = JSON.parse(bytes.toString('utf8')) as unknown;
        parsed.push(...(id === 'seventv' ? parseSevenTv(payload) : id === 'bttv' ? parseBttv(payload) : parseFfz(payload)));
      } catch (error) {
        if (endpoint === endpoints[id][0]) throw error;
      }
    }
    return parsed;
  }

  private async fetchWithLimit(url: string, hosts: Set<string>, maximumBytes: number): Promise<Response> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !hosts.has(parsed.hostname)) throw new Error('Provider URL was rejected.');
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000); timeout.unref?.();
    try {
      const response = await this.fetchImplementation(parsed.href, { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/json,image/*' } });
      if (!response.ok) throw new Error(`Provider request failed (${response.status}).`);
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > maximumBytes) throw new Error('Provider response exceeded the size limit.');
      return response;
    } finally { clearTimeout(timeout); }
  }

  private cacheMedia(id: string, bytes: Buffer, contentType: string): void {
    const existing = this.mediaCache.get(id);
    if (existing) this.mediaCacheBytes -= existing.bytes.length;
    this.mediaCache.delete(id); this.mediaCache.set(id, { bytes, contentType }); this.mediaCacheBytes += bytes.length;
    while (this.mediaCacheBytes > mediaCacheLimit && this.mediaCache.size) {
      const oldest = this.mediaCache.keys().next().value as string;
      const entry = this.mediaCache.get(oldest); this.mediaCache.delete(oldest); this.mediaCacheBytes -= entry?.bytes.length || 0;
    }
  }

  private remove(id: string): void {
    this.items = this.items.filter((item) => item.id !== id);
    const timer = this.removalTimers.get(id);
    if (timer) clearTimeout(timer);
    this.removalTimers.delete(id);
    this.broadcast('remove', { id });
  }

  private scheduleRemoval(item: TempestEmoteWallItem): void {
    const previous = this.removalTimers.get(item.id);
    if (previous) clearTimeout(previous);
    const remaining = Math.max(100, this.settings.lifetimeMs - Math.max(0, Date.now() - new Date(item.occurredAt).getTime()));
    const timer = setTimeout(() => this.remove(item.id), remaining);
    timer.unref?.();
    this.removalTimers.set(item.id, timer);
  }

  private prune(): void {
    const cutoff = Date.now() - this.settings.lifetimeMs;
    for (const item of [...this.items]) if (new Date(item.occurredAt).getTime() <= cutoff) this.remove(item.id);
  }

  private broadcast(event: string, payload: unknown): void { for (const client of this.clients) this.write(client, event, payload); }
  private write(response: ServerResponse, event: string, payload: unknown): void { if (!response.destroyed) response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); }

  private async persist(): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    const temporaryPath = `${this.documentPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, this.documentPath);
  }
}
