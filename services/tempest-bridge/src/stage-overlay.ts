import { ServerResponse } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  INTERACTIVE_STAGE_SCHEMA_VERSION,
  InteractiveStageObject,
  InteractiveStageObjectInput,
  InteractiveStageOrientation,
  InteractiveStagePlacement,
  InteractiveStageProtectedZone,
  InteractiveStageState,
  validateInteractiveStageObjectInput,
  validateInteractiveStagePlacement
} from '@tempest/contracts';

const stagePage = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tempest Interactive Stage</title><style>
*{box-sizing:border-box}html,body,#stage{width:100%;height:100%;margin:0;overflow:hidden;background:transparent}body{font-family:Inter,Segoe UI,sans-serif}.object{--scale:1;position:absolute;display:grid;place-items:center;min-width:3rem;min-height:3rem;padding:.75rem 1rem;color:#eaffff;background:linear-gradient(135deg,rgba(5,20,29,.92),rgba(13,45,53,.86));border:2px solid var(--accent,#54f2eb);border-radius:18px;box-shadow:0 0 32px color-mix(in srgb,var(--accent,#54f2eb) 38%,transparent);font-size:clamp(18px,2.5vw,46px);font-weight:800;line-height:1.05;text-align:center;white-space:pre-wrap;overflow-wrap:anywhere;transform:translate(var(--anchor-x,-50%),var(--anchor-y,-50%)) scale(var(--scale));transform-origin:center;transition:left 220ms ease,top 220ms ease,transform 220ms ease,opacity 180ms ease;will-change:left,top,transform;animation:arrive 260ms cubic-bezier(.2,.8,.2,1)}.object[data-kind=effect]{border-radius:999px;min-width:80px;min-height:80px;border-width:3px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 32%,transparent),transparent 68%);font-size:clamp(24px,4vw,72px);text-shadow:0 0 16px var(--accent)}.object[data-kind=meter]{min-width:min(560px,58vw);min-height:72px;padding:13px 18px;border-radius:10px;background:rgba(4,12,18,.92)}.object[data-kind=sprite]{background:transparent;border-color:transparent;box-shadow:none}.glyph{display:block;font-size:.55em;letter-spacing:.12em;color:var(--accent,#54f2eb);margin-bottom:.28em}.leaving{opacity:0;scale:.75}.meter{display:none;width:100%;height:8px;margin-top:9px;overflow:hidden;border:1px solid color-mix(in srgb,var(--accent) 45%,#21313a);border-radius:99px;background:#071018}.meter i{display:block;width:var(--meter,100%);height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--accent),#fff)}.object[data-has-meter=true] .meter{display:block}.detail{display:none;margin-top:5px;color:#d3e1e6;font:700 9px Consolas,monospace}.object[data-has-meter=true] .detail{display:block}@keyframes arrive{from{opacity:0;scale:.65}}@media(prefers-reduced-motion:reduce){.object{animation:none!important;transition:opacity .1s ease!important}}
</style></head><body><main id="stage" aria-live="polite"></main><script>(()=>{const stage=document.getElementById('stage'),nodes=new Map(),anchors={'top-left':['0%','0%'],top:['-50%','0%'],'top-right':['-100%','0%'],left:['0%','-50%'],center:['-50%','-50%'],right:['-100%','-50%'],'bottom-left':['0%','-100%'],bottom:['-50%','-100%'],'bottom-right':['-100%','-100%']};function render(object){let node=nodes.get(object.id);if(!node){node=document.createElement('article');node.className='object';node.dataset.id=object.id;node.innerHTML='<span class="glyph"></span><span class="label"></span><span class="meter"><i></i></span><span class="detail"></span>';stage.append(node);nodes.set(object.id,node)}const placement=object.placement||{},anchor=anchors[placement.anchor]||anchors.center,props=object.properties||{},value=Number(props.value),maximum=Number(props.maximum),hasMeter=Number.isFinite(value)&&Number.isFinite(maximum)&&maximum>0;node.dataset.kind=object.kind||'text';node.dataset.state=object.state||'idle';node.dataset.hasMeter=String(hasMeter);node.style.left=(Number(placement.x)||0)*100+'%';node.style.top=(Number(placement.y)||0)*100+'%';node.style.zIndex=String(Number(placement.layer)||0);node.style.setProperty('--scale',String(Number(placement.scale)||1));node.style.setProperty('--anchor-x',anchor[0]);node.style.setProperty('--anchor-y',anchor[1]);node.style.setProperty('--accent',String(props.accent||'#54f2eb'));node.style.setProperty('--meter',(hasMeter?Math.max(0,Math.min(100,value/maximum*100)):100)+'%');node.querySelector('.glyph').textContent=String(props.glyph||'STAGE');node.querySelector('.label').textContent=String(props.label||props.text||object.id);node.querySelector('.detail').textContent=hasMeter?Math.round(value)+' / '+Math.round(maximum):''}function remove(id){const node=nodes.get(id);if(!node)return;nodes.delete(id);node.classList.add('leaving');setTimeout(()=>node.remove(),220)}function replace(state){for(const id of [...nodes.keys()])remove(id);for(const object of state.objects||[])render(object)}const orientation=new URLSearchParams(location.search).get('orientation')==='vertical'?'vertical':'horizontal';const events=new EventSource('./interactive-stage/events?orientation='+orientation);events.addEventListener('init',event=>replace(JSON.parse(event.data)));events.addEventListener('upsert',event=>render(JSON.parse(event.data).object));events.addEventListener('remove',event=>remove(JSON.parse(event.data).id));events.addEventListener('clear',()=>replace({objects:[]}));events.onerror=()=>{};})();</script></body></html>`;

type StageClient = { response: ServerResponse; orientation: InteractiveStageOrientation };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export class TempestInteractiveStage {
  private readonly objects = new Map<string, InteractiveStageObject>();
  private readonly clients = new Set<StageClient>();
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();
  private revision = 0;
  private updatedAt = new Date().toISOString();
  private protectedZones: InteractiveStageProtectedZone[] = [];
  private collisionAvoidance = true;
  private readonly settingsPath?: string;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(dataDirectory?: string) {
    this.settingsPath = dataDirectory ? path.join(dataDirectory, 'interactive-stage.json') : undefined;
  }

  async initialize(): Promise<void> {
    if (!this.settingsPath) return;
    await mkdir(path.dirname(this.settingsPath), { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.settingsPath, 'utf8')) as { protectedZones?: unknown; collisionAvoidance?: unknown };
      this.protectedZones = this.validateZones(parsed.protectedZones);
      this.collisionAvoidance = parsed.collisionAvoidance !== false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await this.persistSettings();
    }
  }

  page(): string { return stagePage; }

  connect(response: ServerResponse, orientation: InteractiveStageOrientation): void {
    this.prune();
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    const client = { response, orientation };
    this.clients.add(client);
    this.write(response, 'init', this.state(orientation));
    response.on('close', () => this.clients.delete(client));
  }

  state(orientation: InteractiveStageOrientation = 'horizontal'): InteractiveStageState {
    this.prune();
    return {
      schemaVersion: INTERACTIVE_STAGE_SCHEMA_VERSION,
      revision: this.revision,
      updatedAt: this.updatedAt,
      objects: [...this.objects.values()].map((object) => this.forOrientation(object, orientation)),
      protectedZones: this.protectedZones.filter((zone) => zone.orientations.includes(orientation)).map(clone),
      collisionAvoidance: this.collisionAvoidance
    };
  }

  status(baseUrl: string): Record<string, unknown> {
    const state = this.state();
    return { state: 'ready', ...state, activeCount: this.objects.size, connectedClients: this.clients.size, protectedZones: this.protectedZones.map(clone), horizontalUrl: `${baseUrl}/interactive-stage?orientation=horizontal`, verticalUrl: `${baseUrl}/interactive-stage?orientation=vertical` };
  }

  spawn(input: unknown): InteractiveStageObject {
    const validation = validateInteractiveStageObjectInput(input);
    if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
    if (this.objects.has(validation.value.id)) throw new Error(`Stage object ${validation.value.id} already exists.`);
    if (validation.value.dedupeKey && [...this.objects.values()].some((object) => object.dedupeKey === validation.value!.dedupeKey)) throw new Error(`Stage object dedupe key ${validation.value.dedupeKey} is already active.`);
    const resolved = this.resolveObjectPlacement(validation.value);
    this.objects.set(resolved.id, resolved);
    this.touch();
    this.scheduleExpiry(resolved);
    this.broadcastObject('upsert', resolved);
    return clone(resolved);
  }

  upsert(input: InteractiveStageObjectInput & { id: string }): InteractiveStageObject { return this.objects.has(input.id) ? this.update(input.id, input) : this.spawn(input); }

  preview(): InteractiveStageObject {
    return this.spawn({ kind: 'text', state: 'emote', lifetimeMs: 10_000, owner: { platform: 'studio', userId: 'operator', displayName: 'Studio Operator' }, placement: { x: 0.5, y: 0.72, scale: 1, anchor: 'center', layer: 10 }, properties: { glyph: 'TEMPEST', label: 'Interactive Stage online', accent: '#54f2eb' } });
  }

  update(id: string, patch: unknown): InteractiveStageObject {
    const current = this.require(id);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Stage object update must be an object.');
    const source = patch as Record<string, unknown>;
    if (source.id !== undefined && source.id !== id) throw new Error('A Stage object ID cannot be changed.');
    const merged: InteractiveStageObjectInput = { ...current, ...source, id, owner: source.owner === undefined ? current.owner : source.owner as InteractiveStageObjectInput['owner'], placement: source.placement === undefined ? current.placement : { ...current.placement, ...(source.placement as Partial<InteractiveStagePlacement>) }, properties: source.properties === undefined ? current.properties : { ...current.properties, ...(source.properties as Record<string, string | number | boolean>) }, scenePlacements: source.scenePlacements === undefined ? current.scenePlacements : source.scenePlacements as Record<string, Partial<InteractiveStagePlacement>>, createdAt: current.createdAt, expiresAt: source.lifetimeMs === undefined ? (source.expiresAt === undefined ? current.expiresAt : source.expiresAt as string) : undefined, lifetimeMs: source.lifetimeMs as number | undefined };
    const validation = validateInteractiveStageObjectInput(merged);
    if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
    const resolved = this.resolveObjectPlacement(validation.value);
    this.objects.set(id, resolved);
    this.touch();
    this.scheduleExpiry(resolved);
    this.broadcastObject('upsert', resolved);
    return clone(resolved);
  }

  move(id: string, placement: unknown): InteractiveStageObject {
    const current = this.require(id);
    const validation = validateInteractiveStagePlacement(placement, current.placement);
    if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
    const next = this.resolveObjectPlacement({ ...current, placement: validation.value, updatedAt: new Date().toISOString() });
    this.objects.set(id, next);
    this.touch();
    this.broadcastObject('upsert', next);
    return clone(next);
  }

  dismiss(id: string, reason = 'operator'): boolean {
    if (!this.objects.delete(id)) return false;
    const timer = this.expiryTimers.get(id);
    if (timer) clearTimeout(timer);
    this.expiryTimers.delete(id);
    this.touch();
    this.broadcast('remove', { id, reason, revision: this.revision });
    return true;
  }

  clear(reason = 'operator'): number {
    const removed = this.objects.size;
    for (const timer of this.expiryTimers.values()) clearTimeout(timer);
    this.expiryTimers.clear();
    this.objects.clear();
    if (removed) this.touch();
    this.broadcast('clear', { removed, reason, revision: this.revision });
    return removed;
  }

  async configureLayout(input: unknown): Promise<{ protectedZones: InteractiveStageProtectedZone[]; collisionAvoidance: boolean }> {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    if (source.protectedZones !== undefined) this.protectedZones = this.validateZones(source.protectedZones);
    if (source.collisionAvoidance !== undefined) this.collisionAvoidance = source.collisionAvoidance === true;
    for (const [id, object] of this.objects) { const resolved = this.resolveObjectPlacement(object); this.objects.set(id, resolved); this.broadcastObject('upsert', resolved); }
    this.touch();
    await this.persistSettings();
    for (const client of this.clients) this.write(client.response, 'layout', { revision: this.revision, protectedZones: this.protectedZones.filter((zone) => zone.orientations.includes(client.orientation)).map(clone), collisionAvoidance: this.collisionAvoidance });
    return { protectedZones: this.protectedZones.map(clone), collisionAvoidance: this.collisionAvoidance };
  }

  close(): void { for (const timer of this.expiryTimers.values()) clearTimeout(timer); this.expiryTimers.clear(); for (const client of this.clients) client.response.end(); this.clients.clear(); }

  private require(id: string): InteractiveStageObject { const object = this.objects.get(id); if (!object) throw new Error(`Stage object ${id} was not found.`); return object; }

  private validateZones(value: unknown): InteractiveStageProtectedZone[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 24) throw new Error('Protected zones must be an array with no more than 24 entries.');
    const ids = new Set<string>();
    return value.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Protected zone ${index + 1} must be an object.`);
      const source = entry as Record<string, unknown>, id = String(source.id || `zone-${index + 1}`).trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(id) || ids.has(id)) throw new Error(`Protected zone ${index + 1} has an invalid or duplicate ID.`);
      ids.add(id);
      const number = (key: string, fallback: number, minimum: number, maximum: number) => { const result = source[key] === undefined ? fallback : Number(source[key]); if (!Number.isFinite(result) || result < minimum || result > maximum) throw new Error(`Protected zone ${id} ${key} must be between ${minimum} and ${maximum}.`); return result; };
      const orientations = Array.isArray(source.orientations) ? source.orientations.map(String).filter((item): item is InteractiveStageOrientation => item === 'horizontal' || item === 'vertical') : ['horizontal', 'vertical'] as InteractiveStageOrientation[];
      if (!orientations.length) throw new Error(`Protected zone ${id} needs at least one orientation.`);
      return { id, name: String(source.name || id).trim().slice(0, 80) || id, x: number('x', 0, 0, 1), y: number('y', 0, 0, 1), width: number('width', 0.2, 0.01, 1), height: number('height', 0.2, 0.01, 1), enabled: source.enabled !== false, orientations: [...new Set(orientations)] };
    });
  }

  private resolveObjectPlacement(object: InteractiveStageObject): InteractiveStageObject { const next = clone(object); next.placement = this.resolvePlacement(next.id, next.kind, next.placement, 'horizontal'); if (next.scenePlacements?.vertical) next.scenePlacements.vertical = this.resolvePlacement(next.id, next.kind, next.scenePlacements.vertical, 'vertical'); return next; }

  private resolvePlacement(id: string, kind: InteractiveStageObject['kind'], placement: InteractiveStagePlacement, orientation: InteractiveStageOrientation): InteractiveStagePlacement {
    const radius = 0.03 * placement.scale, clamp = (value: number) => Math.max(radius, Math.min(1 - radius, value));
    const blocked = (candidate: InteractiveStagePlacement) => this.protectedZones.some((zone) => zone.enabled && zone.orientations.includes(orientation) && candidate.x + radius > zone.x && candidate.x - radius < zone.x + zone.width && candidate.y + radius > zone.y && candidate.y - radius < zone.y + zone.height) || (this.collisionAvoidance && [...this.objects.values()].some((other) => { if (other.id === id || other.kind !== kind) return false; const otherPlacement = orientation === 'vertical' ? other.scenePlacements?.vertical || other.placement : other.placement; return Math.hypot(candidate.x - otherPlacement.x, candidate.y - otherPlacement.y) < radius + 0.03 * otherPlacement.scale; }));
    const base = { ...placement, x: clamp(placement.x), y: clamp(placement.y) };
    if (!blocked(base)) return base;
    for (let ring = 1; ring <= 10; ring += 1) for (let step = 0; step < 16; step += 1) { const angle = step / 16 * Math.PI * 2, candidate = { ...base, x: clamp(base.x + Math.cos(angle) * ring * 0.055), y: clamp(base.y + Math.sin(angle) * ring * 0.055) }; if (!blocked(candidate)) return candidate; }
    return base;
  }

  private persistSettings(): Promise<void> { if (!this.settingsPath) return Promise.resolve(); const settingsPath = this.settingsPath, serialized = `${JSON.stringify({ schemaVersion: 1, collisionAvoidance: this.collisionAvoidance, protectedZones: this.protectedZones }, null, 2)}\n`; const operation = this.persistQueue.then(async () => { const temporary = `${settingsPath}.tmp`; await writeFile(temporary, serialized, 'utf8'); await rename(temporary, settingsPath); }); this.persistQueue = operation.catch(() => {}); return operation; }
  private forOrientation(object: InteractiveStageObject, orientation: InteractiveStageOrientation): InteractiveStageObject { const placement = object.scenePlacements?.[orientation] || object.placement; return { ...clone(object), placement: clone(placement) }; }
  private touch(): void { this.revision += 1; this.updatedAt = new Date().toISOString(); }
  private scheduleExpiry(object: InteractiveStageObject): void { const previous = this.expiryTimers.get(object.id); if (previous) clearTimeout(previous); this.expiryTimers.delete(object.id); if (!object.expiresAt) return; const remaining = Math.max(1, Date.parse(object.expiresAt) - Date.now()), timer = setTimeout(() => this.dismiss(object.id, 'expired'), remaining); timer.unref?.(); this.expiryTimers.set(object.id, timer); }
  private prune(): void { const now = Date.now(); for (const object of [...this.objects.values()]) if (object.expiresAt && Date.parse(object.expiresAt) <= now) this.dismiss(object.id, 'expired'); }
  private broadcastObject(event: string, object: InteractiveStageObject): void { for (const client of this.clients) this.write(client.response, event, { revision: this.revision, object: this.forOrientation(object, client.orientation) }); }
  private broadcast(event: string, payload: unknown): void { for (const client of this.clients) this.write(client.response, event, payload); }
  private write(response: ServerResponse, event: string, payload: unknown): void { if (!response.destroyed) response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); }
}
