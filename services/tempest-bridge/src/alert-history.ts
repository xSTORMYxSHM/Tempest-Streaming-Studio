import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TempestAlertQueueItem } from './alert-queue';

export type TempestAlertHistoryState = 'playing' | 'completed' | 'failed' | 'cancelled';

export interface TempestAlertHistoryRecord {
  schemaVersion: 1;
  id: string;
  queueItemId: string;
  kind: 'interaction' | 'twitch';
  alertId: string;
  alertName: string;
  source: string;
  state: TempestAlertHistoryState;
  viewerName?: string;
  variantId?: string;
  variantName?: string;
  audioAssigned: boolean;
  visualAssigned: boolean;
  audioRoute: 'browser-source' | 'studio-local' | 'broadcast-source' | 'none';
  browserClients: number;
  preview: boolean;
  durationMs: number;
  waitMs: number;
  enqueuedAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

interface AlertHistoryDocument {
  schemaVersion: 1;
  records: TempestAlertHistoryRecord[];
  updatedAt: string;
}

const maximumRecords = 500;
const copy = <T>(value: T): T => structuredClone(value);

export class TempestAlertHistory {
  private readonly documentPath: string;
  private records: TempestAlertHistoryRecord[] = [];
  private persistence: Promise<void> = Promise.resolve();

  constructor(private readonly dataDirectory: string) {
    this.documentPath = path.join(dataDirectory, 'alert-history.json');
  }

  async initialize(): Promise<void> {
    try {
      const document = JSON.parse(await readFile(this.documentPath, 'utf8')) as AlertHistoryDocument;
      if (document.schemaVersion === 1 && Array.isArray(document.records)) this.records = document.records.filter((record) => record?.schemaVersion === 1 && typeof record.id === 'string').slice(0, maximumRecords);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  started(item: TempestAlertQueueItem): TempestAlertHistoryRecord {
    const startedAt = item.startedAt || new Date().toISOString();
    const details = item.diagnostics || {};
    const record: TempestAlertHistoryRecord = {
      schemaVersion: 1,
      id: globalThis.crypto.randomUUID(),
      queueItemId: item.id,
      kind: item.kind,
      alertId: item.alertId,
      alertName: item.name,
      source: item.source,
      state: 'playing',
      ...(details.viewerName ? { viewerName: details.viewerName } : {}),
      ...(details.variantId ? { variantId: details.variantId } : {}),
      ...(details.variantName ? { variantName: details.variantName } : {}),
      audioAssigned: Boolean(details.audioAssigned),
      visualAssigned: Boolean(details.visualAssigned),
      audioRoute: details.audioRoute || 'none',
      browserClients: Math.max(0, Math.round(Number(details.browserClients) || 0)),
      preview: Boolean(details.preview),
      durationMs: item.durationMs,
      waitMs: Math.max(0, new Date(startedAt).getTime() - new Date(item.enqueuedAt).getTime()),
      enqueuedAt: item.enqueuedAt,
      startedAt
    };
    this.records.unshift(record);
    this.records = this.records.slice(0, maximumRecords);
    this.persist();
    return copy(record);
  }

  completed(item: TempestAlertQueueItem): void { this.finish(item, 'completed'); }

  failed(item: TempestAlertQueueItem, error: Error): void { this.finish(item, 'failed', error.message); }

  cancelled(items: TempestAlertQueueItem[]): void {
    for (const item of items) {
      const existing = this.records.find((record) => record.queueItemId === item.id);
      if (existing) {
        existing.state = 'cancelled';
        existing.completedAt = new Date().toISOString();
      } else {
        const details = item.diagnostics || {};
        this.records.unshift({
          schemaVersion: 1, id: globalThis.crypto.randomUUID(), queueItemId: item.id, kind: item.kind, alertId: item.alertId, alertName: item.name, source: item.source, state: 'cancelled',
          ...(details.viewerName ? { viewerName: details.viewerName } : {}), ...(details.variantId ? { variantId: details.variantId } : {}), ...(details.variantName ? { variantName: details.variantName } : {}),
          audioAssigned: Boolean(details.audioAssigned), visualAssigned: Boolean(details.visualAssigned), audioRoute: details.audioRoute || 'none', browserClients: Math.max(0, Math.round(Number(details.browserClients) || 0)), preview: Boolean(details.preview),
          durationMs: item.durationMs, waitMs: 0, enqueuedAt: item.enqueuedAt, completedAt: new Date().toISOString()
        });
      }
    }
    this.records = this.records.slice(0, maximumRecords);
    this.persist();
  }

  list(limit = 200): TempestAlertHistoryRecord[] { return this.records.slice(0, Math.max(1, Math.min(maximumRecords, Math.round(limit)))).map(copy); }

  summary(): { total: number; last24Hours: number; failures: number; cancelled: number; averageWaitMs: number; lastPlayedAt?: string } {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const started = this.records.filter((record) => record.startedAt);
    return {
      total: this.records.length,
      last24Hours: started.filter((record) => new Date(record.startedAt!).getTime() >= cutoff).length,
      failures: this.records.filter((record) => record.state === 'failed').length,
      cancelled: this.records.filter((record) => record.state === 'cancelled').length,
      averageWaitMs: started.length ? Math.round(started.reduce((sum, record) => sum + record.waitMs, 0) / started.length) : 0,
      ...(started[0]?.startedAt ? { lastPlayedAt: started[0].startedAt } : {})
    };
  }

  clear(): number {
    const removed = this.records.length;
    this.records = [];
    this.persist();
    return removed;
  }

  async flush(): Promise<void> { await this.persistence; }

  private finish(item: TempestAlertQueueItem, state: 'completed' | 'failed', error?: string): void {
    const record = this.records.find((entry) => entry.queueItemId === item.id) || this.started(item);
    record.state = state;
    record.completedAt = new Date().toISOString();
    if (error) record.error = error.slice(0, 1000);
    this.persist();
  }

  private persist(): void {
    const document: AlertHistoryDocument = { schemaVersion: 1, records: this.records.map(copy), updatedAt: new Date().toISOString() };
    this.persistence = this.persistence.then(async () => {
      await mkdir(this.dataDirectory, { recursive: true });
      const temporaryPath = `${this.documentPath}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      await rename(temporaryPath, this.documentPath);
    });
  }
}
