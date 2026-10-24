import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { CommandRequest, CommandResponse, discordCompanionProtocolVersion, parseSignalMessage, SignalToWorkerMessage, WorkerToSignalMessage } from './protocol';

export interface SignalClientOptions {
  url: string;
  token: string;
  applicationId: string;
  reconnectMs: number;
  guildIds(): string[];
  sessionCount(): number;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

interface PendingCommand {
  timer: NodeJS.Timeout;
  resolve(value: CommandResponse): void;
  reject(error: Error): void;
}

export class TempestSignalClient extends EventEmitter {
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private ready = false;
  private readonly pending = new Map<string, PendingCommand>();
  readonly instanceId = randomUUID();
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;

  constructor(private readonly options: SignalClientOptions) {
    super();
    this.logger = options.logger || console;
  }

  get connected(): boolean {
    return this.ready && this.socket?.readyState === WebSocket.OPEN;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  private connect(): void {
    if (this.stopped || this.socket) return;
    const socket = new WebSocket(this.options.url, { headers: { Authorization: `Bearer ${this.options.token}` }, maxPayload: 256 * 1024 });
    this.socket = socket;
    socket.once('open', () => {
      this.logger.info('Connected to Tempest Signal; authenticating worker.');
      this.send({ type: 'worker.hello', protocolVersion: discordCompanionProtocolVersion, applicationId: this.options.applicationId, instanceId: this.instanceId, guildIds: this.options.guildIds() });
    });
    socket.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as unknown;
        const message = parseSignalMessage(parsed);
        this.onMessage(message);
      } catch (error) {
        this.logger.warn(`Ignored invalid Signal message: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    socket.on('error', (error) => this.logger.warn(`Tempest Signal socket error: ${error.message}`));
    socket.once('close', () => {
      if (this.socket === socket) this.socket = null;
      this.setNotReady('Tempest Signal disconnected.');
      if (!this.stopped) this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, this.options.reconnectMs);
    });
  }

  private onMessage(message: SignalToWorkerMessage): void {
    if (message.type === 'worker.ready') {
      this.ready = true;
      this.emit('ready');
      this.startHeartbeat(message.heartbeatIntervalMs || 30_000);
      return;
    }
    if (message.type === 'command.response') {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.requestId);
      pending.resolve(message);
      return;
    }
    this.emit('message', message);
  }

  private startHeartbeat(intervalMs: number): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => this.send({ type: 'worker.heartbeat', at: new Date().toISOString(), guildCount: this.options.guildIds().length, sessionCount: this.options.sessionCount() }), intervalMs);
  }

  private setNotReady(reason: string): void {
    const wasReady = this.ready;
    this.ready = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      this.pending.delete(requestId);
    }
    if (wasReady) this.emit('disconnect');
  }

  send(message: WorkerToSignalMessage): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  request(input: Omit<CommandRequest, 'type' | 'requestId'>, timeoutMs = 8_000): Promise<CommandResponse> {
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      if (!this.connected) return reject(new Error('Tempest Signal is not connected. Please try again shortly.'));
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('Tempest Signal did not answer in time.'));
      }, timeoutMs);
      this.pending.set(requestId, { timer, resolve, reject });
      if (!this.send({ type: 'command.request', requestId, ...input })) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(new Error('Tempest Signal is not connected. Please try again shortly.'));
      }
    });
  }

  async close(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    const socket = this.socket;
    this.socket = null;
    this.setNotReady('Tempest Discord Companion is stopping.');
    if (!socket || socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { socket.terminate(); resolve(); }, 2_000);
      socket.once('close', () => { clearTimeout(timer); resolve(); });
      socket.close(1000, 'Service stopping');
    });
  }
}
