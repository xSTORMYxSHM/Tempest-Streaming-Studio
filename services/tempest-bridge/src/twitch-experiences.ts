import { createReadStream } from 'node:fs';
import { ServerResponse } from 'node:http';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TempestNormalizedTwitchEvent } from '@tempest/contracts';

export type TempestTwitchExperienceKind = 'hype-train' | 'raid-portal' | 'goal-overlay';
export type TempestTwitchExperiencePreset = 'tempest' | 'mainframe-breach' | 'minimal';

export interface TempestTwitchExperienceDesign {
  preset: TempestTwitchExperiencePreset;
  mediaUri: string;
  mediaLayer: 'background' | 'foreground';
  mediaFit: 'contain' | 'cover' | 'fill';
  mediaOpacity: number;
  customHtml: string;
  customCss: string;
  customJavaScript: string;
}

export interface TempestTwitchExperienceSettings {
  schemaVersion: 1;
  enabled: boolean;
  hypeTrainEnabled: boolean;
  raidPortalEnabled: boolean;
  goalOverlayEnabled: boolean;
  raidDurationMs: number;
  accent: string;
  hypeAccent: string;
  raidAccent: string;
  goalAccent: string;
  hypeTrainDesign: TempestTwitchExperienceDesign;
  raidPortalDesign: TempestTwitchExperienceDesign;
  goalOverlayDesign: TempestTwitchExperienceDesign;
  updatedAt?: string;
}

interface ExperienceState {
  hypeTrain?: Record<string, unknown>;
  raid?: Record<string, unknown>;
  goal?: Record<string, unknown>;
}

const blankDesign = (preset: TempestTwitchExperiencePreset): TempestTwitchExperienceDesign => ({
  preset,
  mediaUri: '',
  mediaLayer: 'background',
  mediaFit: 'cover',
  mediaOpacity: 0.5,
  customHtml: '',
  customCss: '',
  customJavaScript: ''
});

const defaults: TempestTwitchExperienceSettings = {
  schemaVersion: 1,
  enabled: true,
  hypeTrainEnabled: true,
  raidPortalEnabled: true,
  goalOverlayEnabled: true,
  raidDurationMs: 12000,
  accent: '#54F2EB',
  hypeAccent: '#FF4CCF',
  raidAccent: '#54F2EB',
  goalAccent: '#A7FF5C',
  hypeTrainDesign: blankDesign('tempest'),
  raidPortalDesign: blankDesign('mainframe-breach'),
  goalOverlayDesign: blankDesign('tempest')
};

const mediaTypes: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.webm': 'video/webm'
};
const designKeys: Record<TempestTwitchExperienceKind, keyof Pick<TempestTwitchExperienceSettings, 'hypeTrainDesign' | 'raidPortalDesign' | 'goalOverlayDesign'>> = {
  'hype-train': 'hypeTrainDesign',
  'raid-portal': 'raidPortalDesign',
  'goal-overlay': 'goalOverlayDesign'
};

const page = String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tempest Twitch Experiences</title><style>
*{box-sizing:border-box}html,body,#stage{width:100%;height:100%;margin:0;overflow:hidden;background:transparent;color:#f4fbff;font-family:Inter,Segoe UI,sans-serif}#stage{position:relative}.experience{transition:opacity .45s,visibility .45s}.hidden{opacity:0!important;visibility:hidden!important;pointer-events:none!important}.experience-media{position:absolute;inset:0;z-index:0;display:grid;place-items:center;overflow:hidden;pointer-events:none}.experience-media img,.experience-media video{width:100%;height:100%;object-position:center}.experience[data-media-layer=foreground] .experience-media{z-index:3;padding:4%}.experience[data-media-layer=foreground] .experience-media img,.experience[data-media-layer=foreground] .experience-media video{width:min(70vw,1100px);height:min(70vh,760px)}.custom-html{position:absolute;inset:0;z-index:5;pointer-events:none}.label{font:700 10px Consolas,monospace;letter-spacing:.18em}.bar{height:13px;overflow:hidden;border:1px solid #26414a;border-radius:999px;background:#071018}.bar i{display:block;width:0;height:100%;transition:width .65s ease}
.goal{position:absolute;top:4%;right:3%;width:min(520px,31vw);padding:18px 20px;border:1px solid color-mix(in srgb,var(--goal) 65%,#172b36);border-radius:14px;background:linear-gradient(135deg,rgba(5,14,21,.96),rgba(8,22,27,.9));box-shadow:0 0 30px color-mix(in srgb,var(--goal) 20%,transparent)}.goal>*:not(.experience-media):not(.custom-html){position:relative;z-index:2}.goal .label{color:var(--goal)}.goal h2{margin:7px 0 13px;font-size:21px}.goal .bar i{background:linear-gradient(90deg,var(--goal),#fff);box-shadow:0 0 15px var(--goal)}.goal footer{display:flex;justify-content:space-between;margin-top:8px;color:#9bb0b9;font:11px Consolas,monospace}
.hype{position:absolute;inset:0;display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at center,color-mix(in srgb,var(--hype) 18%,transparent),rgba(1,5,9,.88) 52%,rgba(1,5,9,.97));border:3px solid var(--hype)}.hype:before,.hype:after{content:"";position:absolute;z-index:1;width:min(70vw,1050px);aspect-ratio:1;border:2px solid color-mix(in srgb,var(--hype) 50%,transparent);transform:rotate(45deg);animation:spin 18s linear infinite}.hype:after{width:min(48vw,720px);animation-direction:reverse;animation-duration:11s}.hype-card{position:relative;z-index:2;width:min(900px,70vw);padding:42px;text-align:center;border:1px solid var(--hype);clip-path:polygon(4% 0,96% 0,100% 15%,100% 85%,96% 100%,4% 100%,0 85%,0 15%);background:rgba(3,9,15,.93);box-shadow:0 0 60px color-mix(in srgb,var(--hype) 35%,transparent)}.hype h1{margin:8px 0;font-size:clamp(44px,6vw,94px);text-transform:uppercase}.hype .label,.hype-level{color:var(--hype)}.hype-level{font:700 18px Consolas,monospace;letter-spacing:.2em}.hype .bar{height:22px;margin:25px 0 12px}.hype .bar i{background:linear-gradient(90deg,var(--hype),#fff);box-shadow:0 0 15px var(--hype)}.hype small{color:#aec0c8;font:13px Consolas,monospace}
.raid{position:absolute;inset:0;display:grid;place-items:center;overflow:hidden}.raid .label{color:var(--raid)}.portal{position:absolute;z-index:1;width:min(46vw,690px);aspect-ratio:1;border:4px solid var(--raid);border-radius:50%;background:radial-gradient(circle,transparent 0 23%,color-mix(in srgb,var(--raid) 20%,transparent) 24% 27%,transparent 28% 42%,color-mix(in srgb,var(--raid) 45%,transparent) 43% 46%,transparent 47%);filter:drop-shadow(0 0 24px var(--raid));animation:portal 2.1s ease-in-out infinite}.portal:before,.portal:after{content:"";position:absolute;inset:8%;border:2px dashed var(--raid);border-radius:50%;animation:spin 7s linear infinite}.portal:after{inset:20%;animation-direction:reverse;animation-duration:4s}.raid-card{position:relative;z-index:2;min-width:min(700px,72vw);padding:30px 42px;text-align:center;border:1px solid var(--raid);border-radius:14px;background:rgba(3,9,14,.94);box-shadow:0 0 45px color-mix(in srgb,var(--raid) 35%,transparent)}.raid-card h1{margin:8px 0;font-size:clamp(38px,5vw,74px)}.raid-card p{margin:0;color:#b7c9d0;font-size:20px}.raid-card strong{color:var(--raid)}.breach-code{display:none}
.raid[data-preset=mainframe-breach]{background:radial-gradient(circle at center,color-mix(in srgb,var(--raid) 12%,#020704),rgba(0,5,4,.96) 68%);border:3px solid var(--raid);font-family:Consolas,monospace}.raid[data-preset=mainframe-breach]:after{content:"";position:absolute;inset:0;z-index:1;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(0,0,0,.32) 4px),linear-gradient(90deg,transparent 49.8%,color-mix(in srgb,var(--raid) 22%,transparent) 50%,transparent 50.2%);animation:breach-flicker 2.8s steps(2) infinite;pointer-events:none}.raid[data-preset=mainframe-breach] .portal{display:none}.raid[data-preset=mainframe-breach] .breach-code{position:absolute;inset:4%;z-index:1;display:flex;justify-content:space-between;color:color-mix(in srgb,var(--raid) 66%,transparent);font:clamp(10px,1.05vw,18px)/1.65 Consolas,monospace;letter-spacing:.08em;white-space:pre;opacity:.75;animation:code-drift 8s linear infinite}.raid[data-preset=mainframe-breach] .breach-code span:last-child{text-align:right;animation:code-drift 6s linear infinite reverse}.raid[data-preset=mainframe-breach] .raid-card{border-width:2px;border-radius:0;background:rgba(0,9,7,.94);clip-path:polygon(3% 0,97% 0,100% 18%,100% 82%,97% 100%,3% 100%,0 82%,0 18%);box-shadow:0 0 22px var(--raid),inset 0 0 42px color-mix(in srgb,var(--raid) 13%,transparent);animation:breach-card .16s steps(2) 6}.raid[data-preset=mainframe-breach] .raid-card:before{content:"AUTH_OVERRIDE // EXTERNAL SIGNAL ACCEPTED";display:block;margin-bottom:12px;color:var(--raid);font-size:11px;letter-spacing:.2em}.raid[data-preset=mainframe-breach] .raid-card h1{text-transform:uppercase;text-shadow:0 0 16px var(--raid)}
.experience[data-preset=minimal]{border:0;background:transparent}.experience[data-preset=minimal]:before,.experience[data-preset=minimal]:after,.experience[data-preset=minimal] .portal,.experience[data-preset=minimal] .breach-code{display:none}.experience[data-preset=minimal] .hype-card,.experience[data-preset=minimal] .raid-card{clip-path:none;border:0;border-radius:14px;background:rgba(3,9,14,.82);box-shadow:none}.goal[data-preset=minimal]{border:0;background:rgba(3,9,14,.82);box-shadow:none}
.experience[data-preset=mainframe-breach]:not(.raid){font-family:Consolas,monospace;border-color:var(--experience-accent);border-radius:0;background:linear-gradient(135deg,rgba(0,12,9,.96),rgba(1,5,4,.92));box-shadow:inset 0 0 36px color-mix(in srgb,var(--experience-accent) 14%,transparent)}
@keyframes spin{to{transform:rotate(405deg)}}@keyframes portal{50%{transform:scale(1.06);filter:drop-shadow(0 0 45px var(--raid))}}@keyframes breach-card{25%{transform:translateX(-8px)}50%{transform:translateX(7px)}75%{transform:translateX(-3px)}}@keyframes breach-flicker{50%{opacity:.82}}@keyframes code-drift{50%{transform:translateY(-2.5%)}}@media(max-width:900px){.goal{width:48vw}.hype-card{width:84vw}.raid-card{min-width:80vw}}
</style><style id="hypeCustomStyle"></style><style id="raidCustomStyle"></style><style id="goalCustomStyle"></style></head><body><main id="stage">
<section id="goal" class="goal experience hidden"><div id="goalMedia" class="experience-media"></div><span class="label">CHANNEL GOAL</span><h2 id="goalTitle">Channel Goal</h2><div class="bar"><i id="goalBar"></i></div><footer><span id="goalCurrent">0</span><span id="goalTarget">0</span></footer><div id="goalCustomHtml" class="custom-html"></div></section>
<section id="hype" class="hype experience hidden"><div id="hypeMedia" class="experience-media"></div><div class="hype-card"><span class="label">TEMPEST HYPE TRAIN TAKEOVER</span><h1>Hype Train</h1><div id="hypeLevel" class="hype-level">LEVEL 1</div><div class="bar"><i id="hypeBar"></i></div><small id="hypeDetail">0 / 0 · Build the signal</small></div><div id="hypeCustomHtml" class="custom-html"></div></section>
<section id="raid" class="raid experience hidden"><div id="raidMedia" class="experience-media"></div><div class="portal"></div><div class="breach-code" aria-hidden="true"><span>SECURITY_GATE 04<br>AUTH::DENIED<br>AUTH::DENIED<br>CIPHER BREAK 37%<br>CIPHER BREAK 82%<br>PERIMETER FAULT<br>UPLINK DETECTED</span><span>0x4F 0x50 0x45 0x4E<br>PACKET INJECTION<br>TRACE ROUTE: UNKNOWN<br>EXTERNAL NODES: ONLINE<br>FIREWALL BYPASS<br>ACCESS VECTOR LOCKED<br>SIGNAL ACCEPTED</span></div><article class="raid-card"><span id="raidLabel" class="label">INCOMING RAID PORTAL</span><h1 id="raidName">Incoming Channel</h1><p><strong id="raidViewers">42</strong> <span id="raidViewerCopy">viewers crossed the horizon</span></p></article><div id="raidCustomHtml" class="custom-html"></div></section>
</main><script>(()=>{
const q=id=>document.getElementById(id),goal=q('goal'),hype=q('hype'),raid=q('raid');let settings={},state={},cleanups={};
const number=value=>new Intl.NumberFormat().format(Math.max(0,Number(value)||0));const percent=(current,target)=>Math.max(0,Math.min(100,target?current/target*100:0));
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const template=(source,variables)=>String(source||'').replace(/\{([a-zA-Z0-9_]+)\}/g,(_,key)=>escapeHtml(variables[key]??''));
function media(kind,design){const container=q(kind+'Media');container.replaceChildren();if(!design.mediaUri)return;const video=/\.(mp4|webm)(?:$|[?#])/i.test(design.mediaUri);const element=document.createElement(video?'video':'img');element.src='./twitch-experiences/media/'+(kind==='hype'?'hype-train':kind==='raid'?'raid-portal':'goal-overlay');element.style.objectFit=design.mediaFit||'cover';element.style.opacity=String(Number.isFinite(Number(design.mediaOpacity))?design.mediaOpacity:.5);if(video){element.autoplay=true;element.loop=true;element.muted=true;element.playsInline=true}container.append(element)}
function customize(kind,section,design,data,variables){section.dataset.preset=design.preset||'tempest';section.dataset.mediaLayer=design.mediaLayer||'background';section.style.setProperty('--experience-accent',kind==='hype'?'var(--hype)':kind==='raid'?'var(--raid)':'var(--goal)');media(kind,design);q(kind+'CustomStyle').textContent=design.customCss||'';q(kind+'CustomHtml').innerHTML=template(design.customHtml,variables);try{if(typeof cleanups[kind]==='function')cleanups[kind]()}catch(error){console.error('Tempest Twitch Experience cleanup failed',error)}cleanups[kind]=undefined;if(design.customJavaScript){try{const elements={stage:q('stage'),section,media:q(kind+'Media'),customHtml:q(kind+'CustomHtml')};cleanups[kind]=Function('data','variables','elements','"use strict";\n'+design.customJavaScript)(data,variables,elements)}catch(error){console.error('Tempest custom Twitch Experience JavaScript failed',error)}}}
function deactivate(kind){try{if(typeof cleanups[kind]==='function')cleanups[kind]()}catch(error){console.error('Tempest Twitch Experience cleanup failed',error)}cleanups[kind]=undefined;q(kind+'Media').replaceChildren();q(kind+'CustomHtml').replaceChildren();q(kind+'CustomStyle').textContent=''}
function render(){document.documentElement.style.setProperty('--goal',settings.goalAccent||'#A7FF5C');document.documentElement.style.setProperty('--hype',settings.hypeAccent||'#FF4CCF');document.documentElement.style.setProperty('--raid',settings.raidAccent||'#54F2EB');
const g=settings.enabled&&settings.goalOverlayEnabled&&state.goal;goal.classList.toggle('hidden',!g);if(g){const variables={description:g.description||'Channel Goal',current:g.currentAmount||0,target:g.targetAmount||0,percent:percent(g.currentAmount,g.targetAmount),phase:g.phase||'progress'};q('goalTitle').textContent=variables.description;q('goalCurrent').textContent=number(variables.current);q('goalTarget').textContent=number(variables.target);q('goalBar').style.width=variables.percent+'%';customize('goal',goal,settings.goalOverlayDesign||{},g,variables)}else deactivate('goal');
const h=settings.enabled&&settings.hypeTrainEnabled&&state.hypeTrain;hype.classList.toggle('hidden',!h);if(h){const variables={level:h.level||1,progress:h.progress||0,goal:h.goal||0,total:h.total||0,percent:percent(h.progress,h.goal),phase:h.phase||'progress'};q('hypeLevel').textContent='LEVEL '+number(variables.level);q('hypeBar').style.width=variables.percent+'%';q('hypeDetail').textContent=number(variables.progress)+' / '+number(variables.goal)+(variables.phase==='end'?' · TRAIN COMPLETE':' · '+number(variables.total)+' TOTAL');customize('hype',hype,settings.hypeTrainDesign||{},h,variables)}else deactivate('hype');
const r=settings.enabled&&settings.raidPortalEnabled&&state.raid;raid.classList.toggle('hidden',!r);if(r){const variables={broadcaster:r.fromBroadcasterName||'Incoming Channel',viewers:r.viewers||0};q('raidName').textContent=variables.broadcaster;q('raidViewers').textContent=number(variables.viewers);const design=settings.raidPortalDesign||{};q('raidLabel').textContent=design.preset==='mainframe-breach'?'SECURITY MAINFRAME // PERIMETER BREACH':'INCOMING RAID PORTAL';q('raidViewerCopy').textContent=design.preset==='mainframe-breach'?'external signals authenticated':'viewers crossed the horizon';customize('raid',raid,design,r,variables)}else deactivate('raid')}
const events=new EventSource('./twitch-experiences/events');events.addEventListener('init',event=>{const data=JSON.parse(event.data);settings=data.settings||{};state=data.state||{};render()});events.addEventListener('settings',event=>{settings=JSON.parse(event.data);render()});events.addEventListener('state',event=>{state=JSON.parse(event.data);render()});events.onerror=()=>{};
})();</script></body></html>`;

function color(value: unknown, name: string): string {
  const text = String(value || '').toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(text)) throw new Error(`${name} must be a six-digit hex color.`);
  return text;
}

function designText(value: unknown, fallback: string, name: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > 24000) throw new Error(`${name} must contain at most 24,000 characters.`);
  return value;
}

function mediaUri(value: unknown, fallback: string, name: string): string {
  if (value === undefined) return fallback;
  if (value === '') return '';
  if (typeof value !== 'string') throw new Error(`${name} must be a local image or video file URI.`);
  const url = new URL(value);
  if (url.protocol !== 'file:' || !mediaTypes[path.extname(fileURLToPath(url)).toLowerCase()]) throw new Error(`${name} must be a supported local image or video file URI.`);
  return url.href;
}

function choice<T extends string>(value: unknown, fallback: T, allowed: readonly T[], name: string): T {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`${name} is not supported.`);
  return value as T;
}

function validateDesign(value: unknown, fallback: TempestTwitchExperienceDesign, name: string): TempestTwitchExperienceDesign {
  if (value === undefined) return structuredClone(fallback);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  const source = value as Record<string, unknown>;
  const allowed = new Set(['preset', 'mediaUri', 'mediaLayer', 'mediaFit', 'mediaOpacity', 'customHtml', 'customCss', 'customJavaScript']);
  for (const key of Object.keys(source)) if (!allowed.has(key)) throw new Error(`${key} is not a supported ${name} option.`);
  const opacity = source.mediaOpacity === undefined ? fallback.mediaOpacity : Number(source.mediaOpacity);
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error(`${name}.mediaOpacity must be between 0 and 1.`);
  const customHtml = designText(source.customHtml, fallback.customHtml, `${name}.customHtml`);
  if (/<\s*script\b/i.test(customHtml)) throw new Error(`${name}.customHtml must keep JavaScript in the JavaScript field.`);
  const customCss = designText(source.customCss, fallback.customCss, `${name}.customCss`);
  const customJavaScript = designText(source.customJavaScript, fallback.customJavaScript, `${name}.customJavaScript`);
  try { Function('data', 'variables', 'elements', `'use strict';\n${customJavaScript}`); }
  catch (error) { throw new Error(`${name}.customJavaScript is invalid: ${(error as Error).message}`); }
  return {
    preset: choice(source.preset, fallback.preset, ['tempest', 'mainframe-breach', 'minimal'], `${name}.preset`),
    mediaUri: mediaUri(source.mediaUri, fallback.mediaUri, `${name}.mediaUri`),
    mediaLayer: choice(source.mediaLayer, fallback.mediaLayer, ['background', 'foreground'], `${name}.mediaLayer`),
    mediaFit: choice(source.mediaFit, fallback.mediaFit, ['contain', 'cover', 'fill'], `${name}.mediaFit`),
    mediaOpacity: opacity,
    customHtml,
    customCss,
    customJavaScript
  };
}

function validate(value: Partial<TempestTwitchExperienceSettings>): TempestTwitchExperienceSettings {
  const merged = { ...defaults, ...value } as TempestTwitchExperienceSettings;
  for (const key of ['enabled', 'hypeTrainEnabled', 'raidPortalEnabled', 'goalOverlayEnabled'] as const) if (typeof merged[key] !== 'boolean') throw new Error(`${key} must be boolean.`);
  const duration = Number(merged.raidDurationMs);
  if (!Number.isInteger(duration) || duration < 5000 || duration > 30000) throw new Error('raidDurationMs must be between 5000 and 30000.');
  return {
    ...merged,
    schemaVersion: 1,
    raidDurationMs: duration,
    accent: color(merged.accent, 'accent'),
    hypeAccent: color(merged.hypeAccent, 'hypeAccent'),
    raidAccent: color(merged.raidAccent, 'raidAccent'),
    goalAccent: color(merged.goalAccent, 'goalAccent'),
    hypeTrainDesign: validateDesign(value.hypeTrainDesign, defaults.hypeTrainDesign, 'hypeTrainDesign'),
    raidPortalDesign: validateDesign(value.raidPortalDesign, defaults.raidPortalDesign, 'raidPortalDesign'),
    goalOverlayDesign: validateDesign(value.goalOverlayDesign, defaults.goalOverlayDesign, 'goalOverlayDesign')
  };
}

export class TempestTwitchExperiences {
  private settings = structuredClone(defaults);
  private state: ExperienceState = {};
  private clients = new Set<ServerResponse>();
  private raidTimer?: NodeJS.Timeout;
  private hypeTimer?: NodeJS.Timeout;
  private goalTimer?: NodeJS.Timeout;
  private readonly documentPath: string;

  constructor(private readonly dataDirectory: string) { this.documentPath = path.join(dataDirectory, 'twitch-experiences.json'); }

  async initialize(): Promise<void> {
    try { this.settings = validate(JSON.parse(await readFile(this.documentPath, 'utf8')) as Partial<TempestTwitchExperienceSettings>); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await this.persist();
  }

  page(): string { return page; }

  connect(response: ServerResponse): void {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    this.clients.add(response);
    this.write(response, 'init', { settings: this.settings, state: this.state });
    response.on('close', () => this.clients.delete(response));
  }

  ingest(event: TempestNormalizedTwitchEvent): void {
    if (!this.settings.enabled) return;
    if (event.topic === 'viewer.raid.received' && this.settings.raidPortalEnabled) {
      this.state.raid = { fromBroadcasterId: event.payload.fromBroadcasterId, fromBroadcasterName: event.payload.fromBroadcasterName, viewers: event.payload.viewers, occurredAt: event.occurredAt };
      clearTimeout(this.raidTimer);
      this.raidTimer = setTimeout(() => { delete this.state.raid; this.broadcastState(); }, this.settings.raidDurationMs);
      this.raidTimer.unref?.();
    } else if (event.topic === 'channel.hype-train.updated' && this.settings.hypeTrainEnabled) {
      this.state.hypeTrain = { ...event.payload, occurredAt: event.occurredAt };
      clearTimeout(this.hypeTimer);
      if (event.payload.phase === 'end') {
        this.hypeTimer = setTimeout(() => { delete this.state.hypeTrain; this.broadcastState(); }, 8000);
        this.hypeTimer.unref?.();
      }
    } else if (event.topic === 'channel.goal.updated' && this.settings.goalOverlayEnabled) {
      this.state.goal = { ...event.payload, occurredAt: event.occurredAt };
      clearTimeout(this.goalTimer);
      if (event.payload.phase === 'end') {
        this.goalTimer = setTimeout(() => { delete this.state.goal; this.broadcastState(); }, 12000);
        this.goalTimer.unref?.();
      }
    } else return;
    this.broadcastState();
  }

  preview(kind: TempestTwitchExperienceKind): void {
    const base = { schemaVersion: 1 as const, id: globalThis.crypto.randomUUID(), occurredAt: new Date().toISOString(), source: 'twitch' as const, channel: { id: 'studio-preview' } };
    if (kind === 'raid-portal') this.ingest({ ...base, topic: 'viewer.raid.received', viewer: { id: 'raider', displayName: 'Storm Horizon Raiders' }, payload: { fromBroadcasterId: 'raider', fromBroadcasterName: 'Storm Horizon Raiders', viewers: 42 } });
    else if (kind === 'hype-train') this.ingest({ ...base, topic: 'channel.hype-train.updated', payload: { phase: 'progress', hypeTrainId: 'preview', level: 3, total: 4200, progress: 720, goal: 1000, topContributions: [] } });
    else this.ingest({ ...base, topic: 'channel.goal.updated', payload: { phase: 'progress', goalId: 'preview', type: 'subscription', description: 'Reach the next signal horizon', currentAmount: 72, targetAmount: 100 } });
  }

  async update(patch: unknown): Promise<TempestTwitchExperienceSettings> {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Twitch Experience settings must be an object.');
    const source = patch as Record<string, unknown>;
    const allowed = new Set(['enabled', 'hypeTrainEnabled', 'raidPortalEnabled', 'goalOverlayEnabled', 'raidDurationMs', 'accent', 'hypeAccent', 'raidAccent', 'goalAccent', 'hypeTrainDesign', 'raidPortalDesign', 'goalOverlayDesign']);
    for (const key of Object.keys(source)) if (!allowed.has(key)) throw new Error(`${key} is not a Twitch Experience setting.`);
    this.settings = validate({ ...this.settings, ...source, updatedAt: new Date().toISOString() });
    if (!this.settings.enabled) this.clear();
    await this.persist();
    this.broadcast('settings', this.settings);
    return structuredClone(this.settings);
  }

  async serveMedia(kind: TempestTwitchExperienceKind, response: ServerResponse): Promise<boolean> {
    const design = this.settings[designKeys[kind]];
    if (!design.mediaUri) return false;
    const filePath = fileURLToPath(design.mediaUri);
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

  clear(): void {
    clearTimeout(this.raidTimer);
    clearTimeout(this.hypeTimer);
    clearTimeout(this.goalTimer);
    this.state = {};
    this.broadcastState();
  }

  status(url: string): Record<string, unknown> {
    return { state: this.settings.enabled ? 'ready' : 'disabled', url, connectedClients: this.clients.size, settings: structuredClone(this.settings), active: { hypeTrain: Boolean(this.state.hypeTrain), raidPortal: Boolean(this.state.raid), goalOverlay: Boolean(this.state.goal) }, experienceState: structuredClone(this.state) };
  }

  close(): void { this.clear(); for (const client of this.clients) client.end(); this.clients.clear(); }
  private broadcastState(): void { this.broadcast('state', this.state); }
  private broadcast(event: string, payload: unknown): void { for (const client of this.clients) this.write(client, event, payload); }
  private write(response: ServerResponse, event: string, payload: unknown): void { if (!response.destroyed) response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); }
  private async persist(): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    const temporary = `${this.documentPath}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.documentPath);
  }
}
