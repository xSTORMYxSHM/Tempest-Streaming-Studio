import { ServerResponse } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TempestNormalizedTwitchEvent } from '@tempest/contracts';

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
  updatedAt?: string;
}

interface ExperienceState {
  hypeTrain?: Record<string, unknown>;
  raid?: Record<string, unknown>;
  goal?: Record<string, unknown>;
}

const defaults: TempestTwitchExperienceSettings = {
  schemaVersion: 1, enabled: true, hypeTrainEnabled: true, raidPortalEnabled: true, goalOverlayEnabled: true,
  raidDurationMs: 12000, accent: '#54F2EB', hypeAccent: '#FF4CCF', raidAccent: '#54F2EB', goalAccent: '#A7FF5C'
};

const page = String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tempest Twitch Experiences</title><style>
*{box-sizing:border-box}html,body,#stage{width:100%;height:100%;margin:0;overflow:hidden;background:transparent;color:#f4fbff;font-family:Inter,Segoe UI,sans-serif}#stage{position:relative}.hidden{opacity:0!important;visibility:hidden!important;pointer-events:none!important}.goal{position:absolute;top:4%;right:3%;width:min(520px,31vw);padding:18px 20px;border:1px solid color-mix(in srgb,var(--goal) 65%,#172b36);border-radius:14px;background:linear-gradient(135deg,rgba(5,14,21,.96),rgba(8,22,27,.9));box-shadow:0 0 30px color-mix(in srgb,var(--goal) 20%,transparent);transition:.4s}.label{color:var(--goal);font:700 10px Consolas,monospace;letter-spacing:.18em}.goal h2{margin:7px 0 13px;font-size:21px}.bar{height:13px;overflow:hidden;border:1px solid #26414a;border-radius:999px;background:#071018}.bar i{display:block;width:0;height:100%;background:linear-gradient(90deg,var(--goal),#fff);box-shadow:0 0 15px var(--goal);transition:width .65s ease}.goal footer{display:flex;justify-content:space-between;margin-top:8px;color:#9bb0b9;font:11px Consolas,monospace}.hype{position:absolute;inset:0;display:grid;place-items:center;overflow:hidden;background:radial-gradient(circle at center,color-mix(in srgb,var(--hype) 18%,transparent),rgba(1,5,9,.88) 52%,rgba(1,5,9,.97));border:3px solid var(--hype);opacity:1;transition:.5s}.hype:before,.hype:after{content:"";position:absolute;width:min(70vw,1050px);aspect-ratio:1;border:2px solid color-mix(in srgb,var(--hype) 50%,transparent);transform:rotate(45deg);animation:spin 18s linear infinite}.hype:after{width:min(48vw,720px);animation-direction:reverse;animation-duration:11s}.hype-card{position:relative;z-index:2;width:min(900px,70vw);padding:42px;text-align:center;border:1px solid var(--hype);clip-path:polygon(4% 0,96% 0,100% 15%,100% 85%,96% 100%,4% 100%,0 85%,0 15%);background:rgba(3,9,15,.93);box-shadow:0 0 60px color-mix(in srgb,var(--hype) 35%,transparent)}.hype h1{margin:8px 0;font-size:clamp(44px,6vw,94px);text-transform:uppercase}.hype .label,.hype-level{color:var(--hype)}.hype-level{font:700 18px Consolas,monospace;letter-spacing:.2em}.hype .bar{height:22px;margin:25px 0 12px}.hype .bar i{background:linear-gradient(90deg,var(--hype),#fff);box-shadow:0 0 15px var(--hype)}.hype small{color:#aec0c8;font:13px Consolas,monospace}.raid{position:absolute;inset:0;display:grid;place-items:center;overflow:hidden;opacity:1;transition:.45s}.raid .label{color:var(--raid)}.portal{position:absolute;width:min(46vw,690px);aspect-ratio:1;border:4px solid var(--raid);border-radius:50%;background:radial-gradient(circle,transparent 0 23%,color-mix(in srgb,var(--raid) 20%,transparent) 24% 27%,transparent 28% 42%,color-mix(in srgb,var(--raid) 45%,transparent) 43% 46%,transparent 47%);filter:drop-shadow(0 0 24px var(--raid));animation:portal 2.1s ease-in-out infinite}.portal:before,.portal:after{content:"";position:absolute;inset:8%;border:2px dashed var(--raid);border-radius:50%;animation:spin 7s linear infinite}.portal:after{inset:20%;animation-direction:reverse;animation-duration:4s}.raid-card{position:relative;z-index:2;min-width:min(700px,72vw);padding:30px 42px;text-align:center;border:1px solid var(--raid);border-radius:14px;background:rgba(3,9,14,.94);box-shadow:0 0 45px color-mix(in srgb,var(--raid) 35%,transparent)}.raid-card h1{margin:8px 0;font-size:clamp(38px,5vw,74px)}.raid-card p{margin:0;color:#b7c9d0;font-size:20px}.raid-card strong{color:var(--raid)}@keyframes spin{to{transform:rotate(405deg)}}@keyframes portal{50%{transform:scale(1.06);filter:drop-shadow(0 0 45px var(--raid))}}@media(max-width:900px){.goal{width:48vw}.hype-card{width:84vw}.raid-card{min-width:80vw}}
</style></head><body><main id="stage"><section id="goal" class="goal hidden"><span class="label">CHANNEL GOAL</span><h2 id="goalTitle">Channel Goal</h2><div class="bar"><i id="goalBar"></i></div><footer><span id="goalCurrent">0</span><span id="goalTarget">0</span></footer></section><section id="hype" class="hype hidden"><div class="hype-card"><span class="label">TEMPEST HYPE TRAIN TAKEOVER</span><h1>Hype Train</h1><div id="hypeLevel" class="hype-level">LEVEL 1</div><div class="bar"><i id="hypeBar"></i></div><small id="hypeDetail">0 / 0 · Build the signal</small></div></section><section id="raid" class="raid hidden"><div class="portal"></div><article class="raid-card"><span class="label">INCOMING RAID PORTAL</span><h1 id="raidName">Incoming Channel</h1><p><strong id="raidViewers">42</strong> viewers crossed the horizon</p></article></section></main><script>(()=>{const q=id=>document.getElementById(id),goal=q('goal'),hype=q('hype'),raid=q('raid');let settings={},state={};const number=value=>new Intl.NumberFormat().format(Math.max(0,Number(value)||0));const percent=(current,target)=>Math.max(0,Math.min(100,target?current/target*100:0));function render(){document.documentElement.style.setProperty('--goal',settings.goalAccent||'#A7FF5C');document.documentElement.style.setProperty('--hype',settings.hypeAccent||'#FF4CCF');document.documentElement.style.setProperty('--raid',settings.raidAccent||'#54F2EB');const g=settings.enabled&&settings.goalOverlayEnabled&&state.goal;goal.classList.toggle('hidden',!g);if(g){q('goalTitle').textContent=g.description||'Channel Goal';q('goalCurrent').textContent=number(g.currentAmount);q('goalTarget').textContent=number(g.targetAmount);q('goalBar').style.width=percent(g.currentAmount,g.targetAmount)+'%'}const h=settings.enabled&&settings.hypeTrainEnabled&&state.hypeTrain;hype.classList.toggle('hidden',!h);if(h){q('hypeLevel').textContent='LEVEL '+number(h.level||1);q('hypeBar').style.width=percent(h.progress,h.goal)+'%';q('hypeDetail').textContent=number(h.progress)+' / '+number(h.goal)+(h.phase==='end'?' · TRAIN COMPLETE':' · '+number(h.total)+' TOTAL')}const r=settings.enabled&&settings.raidPortalEnabled&&state.raid;raid.classList.toggle('hidden',!r);if(r){q('raidName').textContent=r.fromBroadcasterName||'Incoming Channel';q('raidViewers').textContent=number(r.viewers)}}const events=new EventSource('./twitch-experiences/events');events.addEventListener('init',event=>{const data=JSON.parse(event.data);settings=data.settings||{};state=data.state||{};render()});events.addEventListener('settings',event=>{settings=JSON.parse(event.data);render()});events.addEventListener('state',event=>{state=JSON.parse(event.data);render()});events.onerror=()=>{};})();</script></body></html>`;

function color(value: unknown, name: string): string { const text = String(value || '').toUpperCase(); if (!/^#[0-9A-F]{6}$/.test(text)) throw new Error(`${name} must be a six-digit hex color.`); return text; }
function validate(value: TempestTwitchExperienceSettings): TempestTwitchExperienceSettings {
  for (const key of ['enabled', 'hypeTrainEnabled', 'raidPortalEnabled', 'goalOverlayEnabled'] as const) if (typeof value[key] !== 'boolean') throw new Error(`${key} must be boolean.`);
  const duration = Number(value.raidDurationMs); if (!Number.isInteger(duration) || duration < 5000 || duration > 30000) throw new Error('raidDurationMs must be between 5000 and 30000.');
  return { ...value, schemaVersion: 1, raidDurationMs: duration, accent: color(value.accent, 'accent'), hypeAccent: color(value.hypeAccent, 'hypeAccent'), raidAccent: color(value.raidAccent, 'raidAccent'), goalAccent: color(value.goalAccent, 'goalAccent') };
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
  async initialize(): Promise<void> { try { this.settings = validate({ ...defaults, ...JSON.parse(await readFile(this.documentPath, 'utf8')) }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } await this.persist(); }
  page(): string { return page; }
  connect(response: ServerResponse): void { response.statusCode=200; response.setHeader('Content-Type','text/event-stream; charset=utf-8'); response.setHeader('Cache-Control','no-store'); response.setHeader('Connection','keep-alive'); response.flushHeaders(); this.clients.add(response); this.write(response,'init',{settings:this.settings,state:this.state}); response.on('close',()=>this.clients.delete(response)); }
  ingest(event: TempestNormalizedTwitchEvent): void {
    if (!this.settings.enabled) return;
    if (event.topic === 'viewer.raid.received' && this.settings.raidPortalEnabled) {
      this.state.raid = { fromBroadcasterId: event.payload.fromBroadcasterId, fromBroadcasterName: event.payload.fromBroadcasterName, viewers: event.payload.viewers, occurredAt: event.occurredAt };
      clearTimeout(this.raidTimer); this.raidTimer=setTimeout(()=>{delete this.state.raid;this.broadcastState();},this.settings.raidDurationMs); this.raidTimer.unref?.();
    } else if (event.topic === 'channel.hype-train.updated' && this.settings.hypeTrainEnabled) {
      this.state.hypeTrain = { ...event.payload, occurredAt: event.occurredAt };
      clearTimeout(this.hypeTimer);
      if (event.payload.phase === 'end') { this.hypeTimer=setTimeout(()=>{delete this.state.hypeTrain;this.broadcastState();},8000); this.hypeTimer.unref?.(); }
    } else if (event.topic === 'channel.goal.updated' && this.settings.goalOverlayEnabled) {
      this.state.goal = { ...event.payload, occurredAt: event.occurredAt };
      clearTimeout(this.goalTimer);
      if (event.payload.phase === 'end') { this.goalTimer=setTimeout(()=>{delete this.state.goal;this.broadcastState();},12000); this.goalTimer.unref?.(); }
    } else return;
    this.broadcastState();
  }
  preview(kind: 'hype-train'|'raid-portal'|'goal-overlay'): void {
    const base = { schemaVersion:1 as const,id:globalThis.crypto.randomUUID(),occurredAt:new Date().toISOString(),source:'twitch' as const,channel:{id:'studio-preview'} };
    if (kind==='raid-portal') this.ingest({...base,topic:'viewer.raid.received',viewer:{id:'raider',displayName:'Storm Horizon Raiders'},payload:{fromBroadcasterId:'raider',fromBroadcasterName:'Storm Horizon Raiders',viewers:42}});
    else if(kind==='hype-train') this.ingest({...base,topic:'channel.hype-train.updated',payload:{phase:'progress',hypeTrainId:'preview',level:3,total:4200,progress:720,goal:1000,topContributions:[]}});
    else this.ingest({...base,topic:'channel.goal.updated',payload:{phase:'progress',goalId:'preview',type:'subscription',description:'Reach the next signal horizon',currentAmount:72,targetAmount:100}});
  }
  async update(patch: unknown): Promise<TempestTwitchExperienceSettings> { if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('Twitch Experience settings must be an object.');const source=patch as Record<string,unknown>;const allowed=new Set(['enabled','hypeTrainEnabled','raidPortalEnabled','goalOverlayEnabled','raidDurationMs','accent','hypeAccent','raidAccent','goalAccent']);for(const key of Object.keys(source))if(!allowed.has(key))throw new Error(`${key} is not a Twitch Experience setting.`);this.settings=validate({...this.settings,...source,updatedAt:new Date().toISOString()} as TempestTwitchExperienceSettings);if(!this.settings.enabled)this.clear();await this.persist();this.broadcast('settings',this.settings);return structuredClone(this.settings); }
  clear(): void { clearTimeout(this.raidTimer);clearTimeout(this.hypeTimer);clearTimeout(this.goalTimer);this.state={};this.broadcastState(); }
  status(url:string):Record<string,unknown>{return{state:this.settings.enabled?'ready':'disabled',url,connectedClients:this.clients.size,settings:structuredClone(this.settings),active:{hypeTrain:Boolean(this.state.hypeTrain),raidPortal:Boolean(this.state.raid),goalOverlay:Boolean(this.state.goal)},experienceState:structuredClone(this.state)}}
  close():void{this.clear();for(const client of this.clients)client.end();this.clients.clear()}
  private broadcastState():void{this.broadcast('state',this.state)} private broadcast(event:string,payload:unknown):void{for(const client of this.clients)this.write(client,event,payload)} private write(response:ServerResponse,event:string,payload:unknown):void{if(!response.destroyed)response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)}
  private async persist():Promise<void>{await mkdir(this.dataDirectory,{recursive:true});const temporary=`${this.documentPath}.tmp`;await writeFile(temporary,`${JSON.stringify(this.settings,null,2)}\n`,{encoding:'utf8',mode:0o600});await rename(temporary,this.documentPath)}
}
