import { ServerResponse } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type TempestUnifiedStageModuleId =
  | 'interactiveStage'
  | 'twitchAlerts'
  | 'interactionAlerts'
  | 'twitchExperiences'
  | 'chatOverlay'
  | 'emoteWall'
  | 'diceOverlay'
  | 'discordVoice'
  | 'pollOverlay';

export interface TempestUnifiedStageSettings {
  schemaVersion: 1;
  enabled: boolean;
  modules: Record<TempestUnifiedStageModuleId, boolean>;
  updatedAt?: string;
}

const moduleIds: TempestUnifiedStageModuleId[] = [
  'interactiveStage', 'twitchAlerts', 'interactionAlerts', 'twitchExperiences',
  'chatOverlay', 'emoteWall', 'diceOverlay', 'discordVoice', 'pollOverlay'
];

const defaultSettings: TempestUnifiedStageSettings = {
  schemaVersion: 1,
  enabled: true,
  modules: {
    interactiveStage: true,
    twitchAlerts: true,
    interactionAlerts: true,
    twitchExperiences: true,
    chatOverlay: true,
    emoteWall: true,
    diceOverlay: false,
    discordVoice: true,
    pollOverlay: true
  }
};

const unifiedStagePage = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tempest Unified Stage</title><style>
*{box-sizing:border-box}html,body,#modules{width:100%;height:100%;margin:0;overflow:hidden;background:transparent}iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;pointer-events:none}iframe[data-guarded="true"]{opacity:0;visibility:hidden}#diagnostics{position:fixed;right:12px;bottom:12px;z-index:10000;display:none;max-width:420px;padding:9px 12px;border:1px solid #2e91ad;border-radius:8px;background:rgba(3,10,15,.88);color:#dffcff;font:12px Consolas,monospace}body.debug #diagnostics{display:block}
</style></head><body><main id="modules"></main><output id="diagnostics"></output><script>
(()=>{
  const params=new URLSearchParams(location.search),orientation=params.get('orientation')==='vertical'?'vertical':'horizontal',debug=params.get('debug')==='1',root=document.getElementById('modules'),diagnostics=document.getElementById('diagnostics'),frames=new Map(),reloadTimers=new Map();
  let currentSettings;
  if(debug)document.body.classList.add('debug');
  const definitions={
    interactiveStage:{path:'/interactive-stage',query:{orientation},layer:20,host:'alternate'},
    twitchAlerts:{path:'/visual-alerts/twitch',query:{orientation},layer:80},
    interactionAlerts:{path:'/visual-alerts/interactions',query:{orientation,audio:'0'},layer:81},
    twitchExperiences:{path:'/twitch-experiences',layer:70,host:'alternate'},
    chatOverlay:{path:'/chat-overlay',layer:40,host:'alternate'},
    emoteWall:{path:'/emote-wall',layer:30,host:'alternate',guarded:true},
    diceOverlay:{path:'/dice-overlay',layer:60,host:'alternate'},
    discordVoice:{path:'/discord-voice',layer:50,host:'alternate'},
    pollOverlay:{path:'/poll-overlay',layer:75,host:'alternate'}
  };
  function address(definition){const alternateHost=location.hostname==='localhost'?'127.0.0.1':'localhost',base=definition.host==='alternate'?location.protocol+'//'+alternateHost+':'+location.port:location.href,url=new URL(definition.path,base);for(const [key,value] of Object.entries(definition.query||{}))url.searchParams.set(key,value);return url.href}
  function isEnabled(id){return currentSettings&&currentSettings.enabled!==false&&currentSettings.modules&&currentSettings.modules[id]===true}
  function show(frame){frame.style.opacity='1';frame.style.visibility='visible'}
  function hide(frame){frame.style.opacity='0';frame.style.visibility='hidden'}
  function mount(id){if(frames.has(id)||!definitions[id]||!isEnabled(id))return;const definition=definitions[id],frame=document.createElement('iframe');frame.dataset.module=id;frame.dataset.guarded=definition.guarded?'true':'false';frame.dataset.mountedAt=String(Date.now());frame.title='Tempest '+id;frame.allow='autoplay';frame.style.zIndex=String(definition.layer);if(definition.guarded)hide(frame);frame.src=address(definition);root.append(frame);frames.set(id,frame)}
  function detach(id){const frame=frames.get(id);if(!frame)return;hide(frame);frames.delete(id);frame.src='about:blank';frame.remove()}
  function unmount(id){const timer=reloadTimers.get(id);if(timer){clearTimeout(timer);reloadTimers.delete(id)}detach(id)}
  function recover(id){const frame=frames.get(id);if(!frame||reloadTimers.has(id))return;hide(frame);detach(id);const timer=setTimeout(()=>{reloadTimers.delete(id);if(isEnabled(id))mount(id)},750);reloadTimers.set(id,timer)}
  function apply(settings){currentSettings=settings;const enabled=settings&&settings.enabled!==false;for(const id of Object.keys(definitions)){if(enabled&&settings.modules&&settings.modules[id]===true)mount(id);else unmount(id)}diagnostics.textContent='Unified Stage · '+frames.size+' active module'+(frames.size===1?'':'s')+' · '+[...frames.keys()].join(', ')}
  function receiveHealth(event){if(!event.data||event.data.type!=='tempest.module.heartbeat')return;for(const [id,frame] of frames){if(frame.contentWindow!==event.source||event.data.module!==id)continue;frame.dataset.lastHeartbeat=String(Date.now());show(frame);break}}
  addEventListener('message',receiveHealth);
  const watchdog=setInterval(()=>{if(document.hidden)return;const now=Date.now();for(const [id,frame] of frames){if(frame.dataset.guarded!=='true')continue;const last=Number(frame.dataset.lastHeartbeat||frame.dataset.mountedAt||0);if(now-last>7500)recover(id)}},1000);
  let events;
  function connect(){events=new EventSource('/unified-stage/events');events.addEventListener('init',event=>apply(JSON.parse(event.data)));events.addEventListener('settings',event=>apply(JSON.parse(event.data)));events.onerror=()=>{}}
  addEventListener('pagehide',()=>{events?.close();clearInterval(watchdog);removeEventListener('message',receiveHealth);for(const id of [...frames.keys()])unmount(id)});
  connect();
})();
</script></body></html>`;

function validate(input: unknown): TempestUnifiedStageSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Unified Stage settings must be an object.');
  const source = input as Record<string, unknown>;
  if (typeof source.enabled !== 'boolean') throw new Error('enabled must be boolean.');
  if (!source.modules || typeof source.modules !== 'object' || Array.isArray(source.modules)) throw new Error('modules must be an object.');
  const incoming = source.modules as Record<string, unknown>;
  const modules = { ...defaultSettings.modules };
  for (const key of Object.keys(incoming)) if (!moduleIds.includes(key as TempestUnifiedStageModuleId)) throw new Error(`${key} is not a Unified Stage module.`);
  for (const id of moduleIds) {
    if (typeof incoming[id] !== 'boolean') throw new Error(`${id} must be boolean.`);
    modules[id] = incoming[id] as boolean;
  }
  return { schemaVersion: 1, enabled: source.enabled, modules, ...(typeof source.updatedAt === 'string' ? { updatedAt: source.updatedAt } : {}) };
}

export class TempestUnifiedStage {
  private settings = structuredClone(defaultSettings);
  private readonly clients = new Set<ServerResponse>();
  private readonly documentPath: string;

  constructor(private readonly dataDirectory: string) { this.documentPath = path.join(dataDirectory, 'unified-stage.json'); }

  async initialize(): Promise<void> {
    try {
      const saved = JSON.parse(await readFile(this.documentPath, 'utf8')) as Record<string, unknown>;
      const modules = typeof saved.updatedAt === 'string'
        ? { ...defaultSettings.modules, ...(saved.modules as object || {}) }
        : defaultSettings.modules;
      this.settings = validate({ ...defaultSettings, ...saved, modules });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await this.persist();
  }

  page(): string { return unifiedStagePage; }

  connect(response: ServerResponse): void {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    this.clients.add(response);
    this.write(response, 'init', this.settings);
    response.on('close', () => this.clients.delete(response));
  }

  status(baseUrl: string): Record<string, unknown> {
    return {
      state: this.settings.enabled ? 'ready' : 'disabled',
      url: `${baseUrl}/unified-stage?orientation=horizontal`,
      verticalUrl: `${baseUrl}/unified-stage?orientation=vertical`,
      interactionAudioUrl: `${baseUrl}/visual-alerts/interactions?visual=0&audio=1`,
      connectedClients: [...this.clients].filter((client) => !client.destroyed).length,
      activeModuleCount: this.settings.enabled ? moduleIds.filter((id) => this.settings.modules[id]).length : 0,
      settings: structuredClone(this.settings)
    };
  }

  async update(patch: unknown): Promise<TempestUnifiedStageSettings> {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Unified Stage settings must be an object.');
    const source = patch as Record<string, unknown>;
    const allowed = new Set(['enabled', 'modules']);
    for (const key of Object.keys(source)) if (!allowed.has(key)) throw new Error(`${key} is not a Unified Stage setting.`);
    const modules = source.modules && typeof source.modules === 'object' && !Array.isArray(source.modules)
      ? { ...this.settings.modules, ...(source.modules as Record<string, unknown>) }
      : this.settings.modules;
    this.settings = validate({ ...this.settings, ...source, modules, updatedAt: new Date().toISOString() });
    await this.persist();
    this.broadcast('settings', this.settings);
    return structuredClone(this.settings);
  }

  close(): void { for (const client of this.clients) client.end(); this.clients.clear(); }

  private write(response: ServerResponse, event: string, payload: unknown): void {
    if (!response.destroyed) response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  private broadcast(event: string, payload: unknown): void {
    for (const client of [...this.clients]) {
      if (client.destroyed) this.clients.delete(client);
      else this.write(client, event, payload);
    }
  }

  private async persist(): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    const temporaryPath = `${this.documentPath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, this.documentPath);
  }
}
