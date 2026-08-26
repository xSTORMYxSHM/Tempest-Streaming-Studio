import { randomUUID } from 'node:crypto';

export type TempestAlertQueueKind = 'interaction' | 'twitch';

export interface TempestAlertQueueItem {
  id: string;
  kind: TempestAlertQueueKind;
  alertId: string;
  name: string;
  source: string;
  durationMs: number;
  state: 'waiting' | 'playing';
  enqueuedAt: string;
  startedAt?: string;
  diagnostics?: {
    viewerName?: string;
    variantId?: string;
    variantName?: string;
    audioAssigned?: boolean;
    visualAssigned?: boolean;
    audioRoute?: 'browser-source' | 'studio-local' | 'broadcast-source' | 'none';
    browserClients?: number;
    preview?: boolean;
  };
}

export interface TempestAlertQueueStatus {
  state: 'idle' | 'playing';
  maximumWaiting: number;
  transitionGapMs: number;
  waitingCount: number;
  active?: TempestAlertQueueItem;
  waiting: TempestAlertQueueItem[];
}

interface AlertQueueJob {
  item: TempestAlertQueueItem;
  execute: () => Promise<Record<string, unknown>> | Record<string, unknown>;
}

export interface TempestAlertQueueRequest {
  kind: TempestAlertQueueKind;
  alertId: string;
  name: string;
  source: string;
  durationMs: number;
  diagnostics?: TempestAlertQueueItem['diagnostics'];
  onAccepted?: () => void;
  execute: AlertQueueJob['execute'];
}

export interface TempestAlertQueueAcceptance {
  queued: boolean;
  position: number;
  item: TempestAlertQueueItem;
  result?: Record<string, unknown>;
}

export interface TempestAlertQueueOptions {
  maximumWaiting?: number;
  transitionGapMs?: number;
  onChange?: (status: TempestAlertQueueStatus) => void;
  onError?: (item: TempestAlertQueueItem, error: Error) => void;
  onStarted?: (item: TempestAlertQueueItem) => void;
  onCompleted?: (item: TempestAlertQueueItem) => void;
  onCleared?: (items: TempestAlertQueueItem[]) => void;
}

const copy = <T>(value: T): T => structuredClone(value);

export class TempestAlertQueue {
  private readonly maximumWaiting: number;
  private readonly transitionGapMs: number;
  private readonly onChange?: TempestAlertQueueOptions['onChange'];
  private readonly onError?: TempestAlertQueueOptions['onError'];
  private readonly onStarted?: TempestAlertQueueOptions['onStarted'];
  private readonly onCompleted?: TempestAlertQueueOptions['onCompleted'];
  private readonly onCleared?: TempestAlertQueueOptions['onCleared'];
  private readonly waiting: AlertQueueJob[] = [];
  private active?: AlertQueueJob;
  private completionTimer?: NodeJS.Timeout;
  private transitionTimer?: NodeJS.Timeout;

  constructor(options: TempestAlertQueueOptions = {}) {
    this.maximumWaiting = Math.max(1, Math.min(100, Math.round(options.maximumWaiting || 25)));
    this.transitionGapMs = Math.max(0, Math.min(5000, Math.round(options.transitionGapMs ?? 500)));
    this.onChange = options.onChange;
    this.onError = options.onError;
    this.onStarted = options.onStarted;
    this.onCompleted = options.onCompleted;
    this.onCleared = options.onCleared;
  }

  async enqueue(request: TempestAlertQueueRequest): Promise<TempestAlertQueueAcceptance> {
    if (!Number.isFinite(request.durationMs) || request.durationMs < 250) throw new Error('Alert queue duration must be at least 250 ms.');
    if (this.waiting.length >= this.maximumWaiting) throw new Error(`The Alert Queue is full (${this.maximumWaiting} waiting). Try again after an alert finishes.`);
    const item: TempestAlertQueueItem = {
      id: randomUUID(),
      kind: request.kind,
      alertId: request.alertId,
      name: request.name,
      source: request.source,
      durationMs: Math.min(300000, Math.round(request.durationMs)),
      state: 'waiting',
      enqueuedAt: new Date().toISOString(),
      ...(request.diagnostics ? { diagnostics: copy(request.diagnostics) } : {})
    };
    const job: AlertQueueJob = { item, execute: request.execute };
    request.onAccepted?.();
    if (this.active || this.transitionTimer) {
      this.waiting.push(job);
      this.changed();
      return { queued: true, position: this.waiting.length, item: copy(item) };
    }
    const result = await this.start(job, true);
    return { queued: false, position: 0, item: copy(job.item), result };
  }

  status(): TempestAlertQueueStatus {
    return {
      state: this.active ? 'playing' : 'idle',
      maximumWaiting: this.maximumWaiting,
      transitionGapMs: this.transitionGapMs,
      waitingCount: this.waiting.length,
      ...(this.active ? { active: copy(this.active.item) } : {}),
      waiting: this.waiting.map((job) => copy(job.item))
    };
  }

  clearWaiting(): number {
    const items = this.waiting.map((job) => copy(job.item));
    const removed = this.waiting.length;
    this.waiting.splice(0);
    if (items.length) this.onCleared?.(items);
    this.changed();
    return removed;
  }

  clearAll(): number {
    const items = [...(this.active ? [copy(this.active.item)] : []), ...this.waiting.map((job) => copy(job.item))];
    const removed = this.waiting.length + (this.active ? 1 : 0);
    this.waiting.splice(0);
    if (this.completionTimer) clearTimeout(this.completionTimer);
    if (this.transitionTimer) clearTimeout(this.transitionTimer);
    this.completionTimer = undefined;
    this.transitionTimer = undefined;
    this.active = undefined;
    if (items.length) this.onCleared?.(items);
    this.changed();
    return removed;
  }

  close(): void {
    this.clearAll();
  }

  private async start(job: AlertQueueJob, propagateError: boolean): Promise<Record<string, unknown> | undefined> {
    this.active = job;
    job.item.state = 'playing';
    job.item.startedAt = new Date().toISOString();
    this.onStarted?.(copy(job.item));
    this.changed();
    try {
      const result = await job.execute();
      this.completionTimer = setTimeout(() => this.finish(job.item.id), job.item.durationMs);
      this.completionTimer.unref?.();
      return result;
    } catch (error) {
      this.active = undefined;
      this.onError?.(copy(job.item), error as Error);
      this.scheduleNext();
      if (propagateError) throw error;
      return undefined;
    }
  }

  private finish(itemId: string): void {
    if (this.active?.item.id !== itemId) return;
    const completedItem = copy(this.active.item);
    this.completionTimer = undefined;
    this.active = undefined;
    this.onCompleted?.(completedItem);
    this.changed();
    this.scheduleNext();
  }

  private scheduleNext(): void {
    if (!this.waiting.length) return;
    this.transitionTimer = setTimeout(() => {
      this.transitionTimer = undefined;
      const next = this.waiting.shift();
      if (!next) return this.changed();
      void this.start(next, false);
    }, this.transitionGapMs);
    this.transitionTimer.unref?.();
    this.changed();
  }

  private changed(): void {
    this.onChange?.(this.status());
  }
}
