import { ServerResponse } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TempestNormalizedTwitchEvent } from '@tempest/contracts';

export interface TempestChatOverlaySettings {
  schemaVersion: 1;
  position: 'left' | 'right';
  maxMessages: number;
  messageDurationMs: number;
  showRoles: boolean;
  accent: string;
  backgroundOpacity: number;
  updatedAt?: string;
}

export interface TempestChatOverlayMessage {
  id: string;
  viewerName: string;
  text: string;
  roles: string[];
  sharedChat: boolean;
  occurredAt: string;
}

const defaultSettings: TempestChatOverlaySettings = {
  schemaVersion: 1,
  position: 'left',
  maxMessages: 6,
  messageDurationMs: 30000,
  showRoles: true,
  accent: '#54F2EB',
  backgroundOpacity: 0.84
};

const chatOverlayPage = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tempest Studio Chat Overlay</title>
<style>:root{--accent:#54f2eb;--surface:.84;color-scheme:dark}*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent;font-family:Inter,Segoe UI,sans-serif}#messages{position:absolute;bottom:5vh;display:flex;flex-direction:column;gap:10px;width:min(620px,44vw);padding:16px}#messages.left{left:3vw}#messages.right{right:3vw}.message{position:relative;padding:13px 16px 14px 19px;overflow:hidden;border:1px solid color-mix(in srgb,var(--accent) 34%,#263844);border-radius:13px;background:rgba(6,14,21,var(--surface));box-shadow:0 10px 32px rgba(0,0,0,.34),inset 0 0 24px rgba(84,242,235,.025);opacity:0;transform:translateY(24px) scale(.97);transition:opacity .24s ease,transform .34s cubic-bezier(.2,.9,.2,1)}.message.visible{opacity:1;transform:none}.message.leaving{opacity:0;transform:translateX(-20px) scale(.98)}#messages.right .message.leaving{transform:translateX(20px) scale(.98)}.message:before{position:absolute;inset:0 auto 0 0;width:4px;background:var(--accent);box-shadow:0 0 15px var(--accent);content:""}.head{display:flex;align-items:center;gap:8px;margin-bottom:6px}.name{overflow:hidden;color:#f3fbff;font-size:16px;font-weight:750;text-overflow:ellipsis;white-space:nowrap}.roles{display:flex;gap:5px}.role{padding:3px 5px;border:1px solid color-mix(in srgb,var(--accent) 38%,#31434d);border-radius:999px;color:var(--accent);font:700 8px Consolas,monospace;text-transform:uppercase}.text{margin:0;color:#d8e7ed;font-size:18px;line-height:1.36;overflow-wrap:anywhere}.shared{position:absolute;right:10px;top:9px;color:#8da2ac;font:8px Consolas,monospace;letter-spacing:.1em}@media(max-width:900px){#messages{width:min(560px,75vw)}.text{font-size:16px}}</style></head>
<body><main id="messages" class="left" aria-live="polite"></main><script>(()=>{const list=document.getElementById('messages');let settings={position:'left',maxMessages:6,messageDurationMs:30000,showRoles:true,accent:'#54f2eb',backgroundOpacity:.84};const timers=new Map;function apply(next){settings={...settings,...next};list.className=settings.position;document.documentElement.style.setProperty('--accent',settings.accent||'#54f2eb');document.documentElement.style.setProperty('--surface',String(settings.backgroundOpacity??.84));while(list.children.length>settings.maxMessages)remove(list.firstElementChild?.dataset.id)}function remove(id){if(!id)return;const node=[...list.children].find(entry=>entry.dataset.id===id);clearTimeout(timers.get(id));timers.delete(id);if(!node)return;node.classList.add('leaving');node.classList.remove('visible');setTimeout(()=>node.remove(),300)}function add(message){remove(message.id);const card=document.createElement('article');card.className='message';card.dataset.id=message.id;const head=document.createElement('div');head.className='head';const name=document.createElement('strong');name.className='name';name.textContent=message.viewerName||'Viewer';head.append(name);if(settings.showRoles&&Array.isArray(message.roles)&&message.roles.length){const roles=document.createElement('span');roles.className='roles';for(const value of message.roles.slice(0,3)){const role=document.createElement('i');role.className='role';role.textContent=value;roles.append(role)}head.append(roles)}const text=document.createElement('p');text.className='text';text.textContent=message.text||'';card.append(head,text);if(message.sharedChat){const shared=document.createElement('span');shared.className='shared';shared.textContent='SHARED CHAT';card.append(shared)}list.append(card);requestAnimationFrame(()=>card.classList.add('visible'));while(list.children.length>settings.maxMessages)remove(list.firstElementChild?.dataset.id);const age=Math.max(0,Date.now()-new Date(message.occurredAt).getTime());timers.set(message.id,setTimeout(()=>remove(message.id),Math.max(500,settings.messageDurationMs-age)))}function clear(){for(const id of [...timers.keys()])remove(id)}const events=new EventSource('./chat-overlay/events');events.addEventListener('init',event=>{const data=JSON.parse(event.data);apply(data.settings||{});clear();for(const message of data.messages||[])add(message)});events.addEventListener('settings',event=>apply(JSON.parse(event.data)));events.addEventListener('message',event=>add(JSON.parse(event.data)));events.addEventListener('remove',event=>remove(JSON.parse(event.data).id));events.addEventListener('clear',clear);events.onerror=()=>{};})();</script></body></html>`;

function integer(value: unknown, name: string, minimum: number, maximum: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  return number;
}

function validate(input: TempestChatOverlaySettings): TempestChatOverlaySettings {
  if (!['left', 'right'].includes(input.position)) throw new Error('position must be left or right.');
  if (typeof input.showRoles !== 'boolean') throw new Error('showRoles must be boolean.');
  if (!/^#[0-9a-f]{6}$/i.test(input.accent)) throw new Error('accent must be a six-digit hex color.');
  const opacity = Number(input.backgroundOpacity);
  if (!Number.isFinite(opacity) || opacity < 0.1 || opacity > 1) throw new Error('backgroundOpacity must be between 0.1 and 1.');
  return { ...input, schemaVersion: 1, maxMessages: integer(input.maxMessages, 'maxMessages', 1, 20), messageDurationMs: integer(input.messageDurationMs, 'messageDurationMs', 5000, 120000), accent: input.accent.toUpperCase(), backgroundOpacity: opacity };
}

export class TempestChatOverlay {
  private settings = structuredClone(defaultSettings);
  private messages: TempestChatOverlayMessage[] = [];
  private clients = new Set<ServerResponse>();
  private removalTimers = new Map<string, NodeJS.Timeout>();
  private readonly documentPath: string;

  constructor(private readonly dataDirectory: string) { this.documentPath = path.join(dataDirectory, 'chat-overlay.json'); }

  async initialize(): Promise<void> {
    try { this.settings = validate({ ...defaultSettings, ...JSON.parse(await readFile(this.documentPath, 'utf8')) }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && error instanceof SyntaxError) throw error; }
    await this.persist();
  }

  page(): string { return chatOverlayPage; }

  connect(response: ServerResponse): void {
    this.prune();
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    this.clients.add(response);
    this.write(response, 'init', { settings: this.settings, messages: this.messages });
    response.on('close', () => this.clients.delete(response));
  }

  push(event: TempestNormalizedTwitchEvent): TempestChatOverlayMessage | undefined {
    if (event.topic !== 'viewer.chat.message') return undefined;
    const text = String(event.payload.text || '').trim().slice(0, 500);
    if (!text) return undefined;
    const message: TempestChatOverlayMessage = {
      id: event.id,
      viewerName: (event.viewer?.displayName || event.viewer?.login || 'Viewer').slice(0, 80),
      text,
      roles: (event.viewer?.roles || []).filter((role) => typeof role === 'string').slice(0, 5),
      sharedChat: event.payload.sharedChat === true,
      occurredAt: event.occurredAt
    };
    this.messages = this.messages.filter((entry) => entry.id !== message.id);
    this.messages.push(message);
    while (this.messages.length > this.settings.maxMessages) this.remove(this.messages[0].id);
    this.broadcast('message', message);
    this.scheduleRemoval(message);
    return structuredClone(message);
  }

  preview(): TempestChatOverlayMessage {
    return this.push({ schemaVersion: 1, id: globalThis.crypto.randomUUID(), topic: 'viewer.chat.message', occurredAt: new Date().toISOString(), source: 'twitch', channel: { id: 'studio-preview' }, viewer: { id: 'studio-operator', displayName: 'Sample Viewer', roles: ['subscriber'] }, payload: { messageId: globalThis.crypto.randomUUID(), text: 'The Studio chat overlay is online and ready for your broadcast.' } }) as TempestChatOverlayMessage;
  }

  async update(patch: unknown): Promise<TempestChatOverlaySettings> {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Chat Overlay settings must be an object.');
    const source = patch as Record<string, unknown>;
    const allowed = new Set(['position', 'maxMessages', 'messageDurationMs', 'showRoles', 'accent', 'backgroundOpacity']);
    for (const key of Object.keys(source)) if (!allowed.has(key)) throw new Error(`${key} is not a Chat Overlay setting.`);
    this.settings = validate({ ...this.settings, ...source, updatedAt: new Date().toISOString() } as TempestChatOverlaySettings);
    while (this.messages.length > this.settings.maxMessages) this.remove(this.messages[0].id);
    for (const message of this.messages) this.scheduleRemoval(message);
    await this.persist();
    this.broadcast('settings', this.settings);
    return structuredClone(this.settings);
  }

  clear(): void {
    for (const timer of this.removalTimers.values()) clearTimeout(timer);
    this.removalTimers.clear();
    this.messages = [];
    this.broadcast('clear', {});
  }

  status(url: string): Record<string, unknown> {
    this.prune();
    return { state: 'ready', url, connectedClients: this.clients.size, messageCount: this.messages.length, settings: structuredClone(this.settings), messages: this.messages.map((message) => structuredClone(message)) };
  }

  close(): void { this.clear(); for (const client of this.clients) client.end(); this.clients.clear(); }

  private remove(id: string): void {
    this.messages = this.messages.filter((message) => message.id !== id);
    const timer = this.removalTimers.get(id);
    if (timer) clearTimeout(timer);
    this.removalTimers.delete(id);
    this.broadcast('remove', { id });
  }

  private scheduleRemoval(message: TempestChatOverlayMessage): void {
    const previous = this.removalTimers.get(message.id);
    if (previous) clearTimeout(previous);
    const remaining = Math.max(100, this.settings.messageDurationMs - Math.max(0, Date.now() - new Date(message.occurredAt).getTime()));
    const timer = setTimeout(() => this.remove(message.id), remaining);
    timer.unref?.();
    this.removalTimers.set(message.id, timer);
  }

  private prune(): void {
    const cutoff = Date.now() - this.settings.messageDurationMs;
    for (const message of [...this.messages]) if (new Date(message.occurredAt).getTime() <= cutoff) this.remove(message.id);
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
