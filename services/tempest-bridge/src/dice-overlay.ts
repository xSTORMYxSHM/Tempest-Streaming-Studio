import { randomInt, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { ServerResponse } from 'node:http';
import path from 'node:path';

export type TempestDiceTheme = 'stormglass' | 'brass' | 'obsidian';

export interface TempestDiceOverlaySettings {
  schemaVersion: 1;
  enabled: boolean;
  theme: TempestDiceTheme;
  durationMs: number;
  soundEnabled: boolean;
  showReason: boolean;
  scalePercent: number;
  updatedAt?: string;
}

export interface TempestResolvedDie {
  index: number;
  sides: number;
  value: number;
  kept: boolean;
}

export interface TempestStudioDiceRoll {
  id: string;
  expression: string;
  dice: TempestResolvedDie[];
  modifier: number;
  subtotal: number;
  total: number;
  reason: string;
  rollerName: string;
  rolledAt: string;
}

interface ParsedDiceExpression {
  expression: string;
  count: number;
  sides: number;
  keepMode?: 'kh' | 'kl';
  keepCount?: number;
  modifier: number;
}

const defaultSettings: TempestDiceOverlaySettings = {
  schemaVersion: 1,
  enabled: true,
  theme: 'stormglass',
  durationMs: 5200,
  soundEnabled: false,
  showReason: true,
  scalePercent: 100
};

const diceOverlayPage = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tempest Studio 3D Dice</title>
<style>
*{box-sizing:border-box}html,body,#stage{width:100%;height:100%;margin:0;overflow:hidden;background:transparent}body{font-family:Inter,"Segoe UI",sans-serif;color:#edffff}#stage{--face:linear-gradient(145deg,rgba(74,170,199,.96),#123044 72%);--edge:#071b29;--line:#a2ecff;--text:#f2fdff;--glow:rgba(109,220,240,.55);display:grid;place-items:center;perspective:1100px;pointer-events:none}#stage[data-theme="brass"]{--face:linear-gradient(145deg,#9a7739,#3b280f 72%);--edge:#1e1408;--line:#f3cf78;--text:#fff3c6;--glow:rgba(227,189,109,.55)}#stage[data-theme="obsidian"]{--face:linear-gradient(145deg,#403b55,#09080d 72%);--edge:#030305;--line:#b9a6e8;--text:#f3ecff;--glow:rgba(155,130,217,.55)}
.scene{position:absolute;inset:0;display:grid;place-items:center;align-content:center;gap:clamp(18px,3vh,42px);padding:5vh 5vw;opacity:0;background:radial-gradient(circle at 50% 47%,rgba(6,23,31,.72),rgba(0,0,0,0) 62%);transform:scale(var(--scale,1));transition:opacity .2s ease}.scene.active{opacity:1}.tray{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:clamp(13px,1.6vw,28px);width:min(92vw,1420px);min-height:160px;transform-style:preserve-3d}.die{--throw-x:-32vw;--throw-z:-620deg;position:relative;display:grid;place-items:center;width:clamp(92px,9vw,170px);height:clamp(92px,9vw,170px);opacity:0;filter:drop-shadow(0 28px 20px rgba(0,0,0,.68));transform-style:preserve-3d;animation:toss 1.45s cubic-bezier(.12,.72,.2,1) var(--delay) forwards}.die:nth-child(3n+2){--throw-x:30vw;--throw-z:700deg}.die:nth-child(3n){--throw-x:8vw;--throw-z:-820deg}.face,.edge{position:absolute;inset:0;display:grid;place-items:center;clip-path:polygon(50% 0,94% 24%,94% 76%,50% 100%,6% 76%,6% 24%)}.edge{background:var(--edge);transform:translate3d(13px,18px,-24px) scale(.98)}.face{overflow:hidden;border:2px solid var(--line);background:var(--face);color:var(--text);transform:translateZ(16px);box-shadow:inset 0 0 42px rgba(255,255,255,.09);font-style:normal}.face:before,.face:after{content:"";position:absolute;inset:8%;border:1px solid color-mix(in srgb,var(--line) 38%,transparent);clip-path:inherit;transform:rotate(29deg)}.face:after{inset:23%;transform:rotate(-24deg);opacity:.72}.face small,.face b{position:relative;z-index:1;display:block;text-align:center;text-shadow:0 3px 9px #000}.face small{align-self:end;margin-bottom:-8px;font:800 clamp(10px,.75vw,15px)/1 Consolas,monospace;letter-spacing:.12em;opacity:.8}.face b{align-self:start;font:800 clamp(36px,3.7vw,70px)/1 Georgia,serif}.d4 .face,.d4 .edge{clip-path:polygon(50% 2%,98% 93%,2% 93%)}.d6 .face,.d6 .edge{clip-path:polygon(10% 2%,90% 2%,98% 10%,98% 90%,90% 98%,10% 98%,2% 90%,2% 10%)}.d8 .face,.d8 .edge{clip-path:polygon(50% 0,97% 50%,50% 100%,3% 50%)}.d10 .face,.d10 .edge,.d100 .face,.d100 .edge{clip-path:polygon(50% 0,88% 17%,100% 60%,50% 100%,0 60%,12% 17%)}.d12 .face,.d12 .edge{clip-path:polygon(50% 0,91% 20%,100% 63%,72% 100%,28% 100%,0 63%,9% 20%)}.d20 .face,.d20 .edge{clip-path:polygon(50% 0,96% 29%,79% 100%,21% 100%,4% 29%)}.settled .die.dropped{opacity:.35!important;transform:translateY(12px) scale(.88)!important;filter:grayscale(.75) drop-shadow(0 20px 14px rgba(0,0,0,.55));transition:opacity .25s ease,transform .25s ease}.overflow{display:grid;place-items:center;width:clamp(84px,7vw,130px);height:clamp(84px,7vw,130px);border:2px dashed var(--line);border-radius:50%;color:var(--text);font:800 clamp(24px,2vw,38px)/1 Georgia,serif}.overflow small{display:block;font:700 clamp(7px,.55vw,11px)/1 Consolas,monospace;text-transform:uppercase}.result{display:grid;grid-template-columns:auto auto;align-items:end;gap:4px clamp(14px,1.4vw,26px);opacity:0;transform:translateY(15px);animation:result-in .38s ease 1.18s forwards;text-align:center;text-shadow:0 4px 16px #000}.result small{grid-column:1/-1;color:var(--line);font:800 clamp(9px,.7vw,14px)/1 Consolas,monospace;letter-spacing:.18em}.result strong{color:#fff1b9;font:800 clamp(56px,6vw,112px)/.85 Georgia,serif}.result span{align-self:center;color:#d8f5f5;font:800 clamp(18px,1.7vw,34px)/1 Consolas,monospace}.reason{grid-column:1/-1;max-width:80vw;margin:7px 0 0;color:#fff;font:700 clamp(17px,1.6vw,31px)/1.2 Inter,sans-serif}.roller{grid-column:1/-1;color:#9fc6cc;font:700 clamp(9px,.7vw,14px)/1 Consolas,monospace;letter-spacing:.13em;text-transform:uppercase}
@keyframes toss{0%{opacity:0;transform:translate3d(var(--throw-x),-42vh,230px) rotateX(-900deg) rotateY(740deg) rotateZ(var(--throw-z)) scale(.3)}68%{opacity:1;transform:translate3d(0,12px,38px) rotateX(17deg) rotateY(-22deg) rotateZ(9deg) scale(1.09)}82%{transform:translate3d(0,-8px,15px) rotateX(-7deg) rotateY(9deg) rotateZ(-4deg) scale(.97)}100%{opacity:1;transform:translate3d(0,0,0) rotateX(0) rotateY(0) rotateZ(0) scale(1)}}@keyframes result-in{to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.die,.result{animation-duration:.01ms;animation-delay:0ms}.scene{transition:none}}
</style></head><body><main id="stage" aria-live="polite"></main><script>(()=>{const stage=document.getElementById('stage');let settings={theme:'stormglass',durationMs:5200,soundEnabled:false,showReason:true,scalePercent:100},timer=0,impactAudio,impactUrl;const dieClass=s=>[4,6,8,10,12,20,100].includes(Number(s))?'d'+s:'dgeneric';function apply(next){settings={...settings,...next};stage.dataset.theme=settings.theme||'stormglass';stage.style.setProperty('--scale',String(Math.max(.6,Math.min(1.4,Number(settings.scalePercent||100)/100))))}function clear(){clearTimeout(timer);stage.replaceChildren()}function impactWav(){const rate=22050,count=Math.floor(rate*.32),buffer=new ArrayBuffer(44+count*2),view=new DataView(buffer),write=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i))};write(0,'RIFF');view.setUint32(4,36+count*2,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,count*2,true);for(let i=0;i<count;i++){const t=i/rate,envelope=Math.pow(1-i/count,3),sample=(Math.sin(2*Math.PI*132*t)+.55*Math.sin(2*Math.PI*197*t)+.28*Math.sin(2*Math.PI*281*t))*envelope*.24;view.setInt16(44+i*2,Math.max(-1,Math.min(1,sample))*32767,true)}return new Blob([buffer],{type:'audio/wav'})}function sound(){if(!settings.soundEnabled)return;try{if(!impactUrl)impactUrl=URL.createObjectURL(impactWav());if(!impactAudio){impactAudio=new Audio(impactUrl);impactAudio.preload='auto';impactAudio.volume=.72}else{impactAudio.pause();impactAudio.currentTime=0}impactAudio.play().catch(error=>console.error('Tempest dice impact audio failed: '+error.message))}catch(error){console.error('Tempest dice impact audio failed: '+error.message)}}function show(roll){if(!roll||!Array.isArray(roll.dice))return;clear();const scene=document.createElement('section');scene.className='scene';const tray=document.createElement('div');tray.className='tray';roll.dice.slice(0,12).forEach((die,index)=>{const node=document.createElement('span');node.className='die '+dieClass(die.sides)+' '+(die.kept?'kept':'dropped');node.style.setProperty('--delay',(index*55)+'ms');const edge=document.createElement('i');edge.className='edge';const face=document.createElement('i');face.className='face';const kind=document.createElement('small');kind.textContent='d'+die.sides;const value=document.createElement('b');value.textContent=String(die.value);face.append(kind,value);node.append(edge,face);tray.append(node)});if(roll.dice.length>12){const overflow=document.createElement('span');overflow.className='overflow';overflow.textContent='+'+(roll.dice.length-12);const label=document.createElement('small');label.textContent='more dice';overflow.append(label);tray.append(overflow)}const result=document.createElement('div');result.className='result';const eyebrow=document.createElement('small');eyebrow.textContent='TEMPEST STUDIO 3D DICE';const total=document.createElement('strong');total.textContent=String(roll.total);const expression=document.createElement('span');expression.textContent=roll.expression;result.append(eyebrow,total,expression);if(settings.showReason&&roll.reason){const reason=document.createElement('p');reason.className='reason';reason.textContent=roll.reason;result.append(reason)}if(roll.rollerName){const roller=document.createElement('div');roller.className='roller';roller.textContent='Rolled by '+roll.rollerName;result.append(roller)}scene.append(tray,result);stage.append(scene);requestAnimationFrame(()=>scene.classList.add('active'));setTimeout(()=>{if(scene.isConnected){scene.classList.add('settled');sound()}},1200+Math.min(roll.dice.length,8)*55);timer=setTimeout(clear,Math.max(2500,Number(settings.durationMs)||5200))}const events=new EventSource('./dice-overlay/events');events.addEventListener('init',event=>apply(JSON.parse(event.data).settings||{}));events.addEventListener('settings',event=>apply(JSON.parse(event.data)));events.addEventListener('roll',event=>show(JSON.parse(event.data)));events.addEventListener('clear',clear);events.onerror=()=>{};window.addEventListener('beforeunload',()=>{if(impactUrl)URL.revokeObjectURL(impactUrl)});})();</script></body></html>`;

function integer(value: unknown, name: string, minimum: number, maximum: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  return number;
}

export function parseStudioDiceExpression(value: unknown): ParsedDiceExpression {
  const expression = String(value || '').replace(/\s+/g, '').toLowerCase();
  const match = expression.match(/^(\d{1,2})d(\d{1,4})(?:(kh|kl)(\d{1,2}))?([+-]\d{1,4})?$/);
  if (!match) throw new Error('Use dice notation such as 1d20, 2d6+3, 2d20kh1, or 2d20kl1.');
  const count = integer(match[1], 'Dice count', 1, 20);
  const sides = integer(match[2], 'Die sides', 2, 1000);
  const keepMode = match[3] as 'kh' | 'kl' | undefined;
  const keepCount = match[4] === undefined ? undefined : integer(match[4], 'Keep count', 1, count);
  const modifier = match[5] === undefined ? 0 : integer(match[5], 'Modifier', -1000, 1000);
  return { expression: `${count}d${sides}${keepMode ? `${keepMode}${keepCount}` : ''}${modifier ? `${modifier > 0 ? '+' : ''}${modifier}` : ''}`, count, sides, keepMode, keepCount, modifier };
}

function validateSettings(input: TempestDiceOverlaySettings): TempestDiceOverlaySettings {
  if (typeof input.enabled !== 'boolean' || typeof input.soundEnabled !== 'boolean' || typeof input.showReason !== 'boolean') throw new Error('Dice overlay toggles must be boolean.');
  if (!['stormglass', 'brass', 'obsidian'].includes(input.theme)) throw new Error('Dice theme must be stormglass, brass, or obsidian.');
  return {
    ...input,
    schemaVersion: 1,
    durationMs: integer(input.durationMs, 'Display duration', 2500, 15000),
    scalePercent: integer(input.scalePercent, 'Dice scale', 60, 140)
  };
}

export class TempestDiceOverlay {
  private settings = structuredClone(defaultSettings);
  private latestRoll?: TempestStudioDiceRoll;
  private history: TempestStudioDiceRoll[] = [];
  private clients = new Set<ServerResponse>();
  private readonly documentPath: string;

  constructor(private readonly dataDirectory: string) {
    this.documentPath = path.join(dataDirectory, 'dice-overlay.json');
  }

  async initialize(): Promise<void> {
    try { this.settings = validateSettings({ ...defaultSettings, ...JSON.parse(await readFile(this.documentPath, 'utf8')) }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && error instanceof SyntaxError) throw error; }
    await this.persist();
  }

  page(): string { return diceOverlayPage; }

  connect(response: ServerResponse): void {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    this.clients.add(response);
    this.write(response, 'init', { settings: this.settings });
    response.on('close', () => this.clients.delete(response));
  }

  roll(input: unknown): TempestStudioDiceRoll {
    if (!this.settings.enabled) throw new Error('The 3D Dice overlay is disabled.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Dice roll request must be an object.');
    const request = input as Record<string, unknown>;
    const parsed = parseStudioDiceExpression(request.expression);
    const reason = String(request.reason || '').trim().slice(0, 160);
    const rollerName = String(request.rollerName || 'Streamer').trim().slice(0, 80) || 'Streamer';
    const values = Array.from({ length: parsed.count }, () => randomInt(1, parsed.sides + 1));
    let keptIndices = new Set(values.map((_value, index) => index));
    if (parsed.keepMode && parsed.keepCount) {
      const descending = parsed.keepMode === 'kh';
      const ranked = values.map((_value, index) => index).sort((left, right) => descending ? values[right] - values[left] : values[left] - values[right]);
      keptIndices = new Set(ranked.slice(0, parsed.keepCount));
    }
    const dice = values.map((value, index) => ({ index, sides: parsed.sides, value, kept: keptIndices.has(index) }));
    const subtotal = dice.reduce((sum, die) => sum + (die.kept ? die.value : 0), 0);
    const roll: TempestStudioDiceRoll = {
      id: randomUUID(), expression: parsed.expression, dice, modifier: parsed.modifier,
      subtotal, total: subtotal + parsed.modifier, reason, rollerName, rolledAt: new Date().toISOString()
    };
    this.latestRoll = roll;
    this.history.unshift(roll);
    this.history = this.history.slice(0, 20);
    this.broadcast('roll', roll);
    return structuredClone(roll);
  }

  async update(patch: unknown): Promise<TempestDiceOverlaySettings> {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Dice overlay settings must be an object.');
    this.settings = validateSettings({ ...this.settings, ...(patch as Partial<TempestDiceOverlaySettings>), schemaVersion: 1, updatedAt: new Date().toISOString() });
    await this.persist();
    this.broadcast('settings', this.settings);
    return structuredClone(this.settings);
  }

  clear(): void { this.broadcast('clear', {}); }

  status(url: string): Record<string, unknown> {
    return { url, connectedClients: this.clients.size, settings: structuredClone(this.settings), latestRoll: this.latestRoll ? structuredClone(this.latestRoll) : undefined, history: structuredClone(this.history) };
  }

  close(): void {
    for (const client of this.clients) client.end();
    this.clients.clear();
  }

  private broadcast(type: string, payload: unknown): void {
    for (const client of [...this.clients]) {
      if (client.destroyed || client.writableEnded) this.clients.delete(client);
      else this.write(client, type, payload);
    }
  }

  private write(response: ServerResponse, type: string, payload: unknown): void {
    response.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  private async persist(): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    const temporary = `${this.documentPath}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.documentPath);
  }
}
