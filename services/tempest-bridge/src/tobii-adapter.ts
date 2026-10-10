import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { createInterface, Interface } from 'node:readline';
import { isAbsolute, normalize } from 'node:path';
import { stat } from 'node:fs/promises';

export interface TobiiAdapterStatus {
  state: 'unconfigured' | 'stopped' | 'connecting' | 'connected' | 'error';
  configured: boolean;
  source: 'tgi-sidecar';
  samples: number;
  lastSampleAt?: string;
  message: string;
}

export class TempestTobiiAdapter {
  private process?: ChildProcessWithoutNullStreams;
  private lines?: Interface;
  private samples = 0;
  private lastSampleAt?: string;
  private state: TobiiAdapterStatus['state'];
  private message: string;

  constructor(private readonly executablePath: string | undefined, private readonly onSample: (sample: { x: number; y: number; confidence: number }) => void | Promise<void>) {
    this.state = executablePath ? 'stopped' : 'unconfigured';
    this.message = executablePath ? 'Approved Tobii Game Integration sidecar is ready to connect.' : 'Set TEMPEST_TOBII_ADAPTER_PATH to an approved Tobii Game Integration sidecar executable.';
  }

  status(): TobiiAdapterStatus { return { state: this.state, configured: Boolean(this.executablePath), source: 'tgi-sidecar', samples: this.samples, ...(this.lastSampleAt ? { lastSampleAt: this.lastSampleAt } : {}), message: this.message }; }

  async connect(): Promise<TobiiAdapterStatus> {
    if (this.process) return this.status();
    const executable = normalize(String(this.executablePath || ''));
    if (!executable || !isAbsolute(executable) || !/\.exe$/i.test(executable)) throw new Error('The Tobii adapter path must be an absolute Windows executable path.');
    const details = await stat(executable).catch(() => null);
    if (!details?.isFile() || details.size < 1024 || details.size > 200 * 1024 * 1024) throw new Error('The configured Tobii adapter executable is missing or outside the 200 MB safety limit.');
    this.state = 'connecting'; this.message = 'Starting the local Tobii Game Integration adapter…';
    const child = spawn(executable, ['--tempest-jsonl'], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.process = child;
    this.lines = createInterface({ input: child.stdout });
    this.lines.on('line', (line) => { void this.consume(line); });
    child.stderr.on('data', (bytes) => { const detail = String(bytes).trim(); if (detail) this.message = detail.slice(0, 240); });
    child.once('spawn', () => { this.state = 'connected'; this.message = 'Receiving local Tobii Game Integration samples. Raw gaze is not persisted.'; });
    child.once('error', (error) => { this.state = 'error'; this.message = error.message; this.cleanup(); });
    child.once('exit', (code) => { if (this.process === child) { this.state = code === 0 ? 'stopped' : 'error'; this.message = code === 0 ? 'Tobii adapter stopped.' : `Tobii adapter exited with code ${code}.`; this.cleanup(); } });
    return this.status();
  }

  async disconnect(): Promise<TobiiAdapterStatus> {
    const child = this.process;
    this.cleanup();
    if (child && !child.killed) child.kill();
    this.state = this.executablePath ? 'stopped' : 'unconfigured';
    this.message = 'Tobii adapter stopped.';
    return this.status();
  }

  async close(): Promise<void> { await this.disconnect(); }

  private async consume(line: string): Promise<void> {
    if (line.length > 4096) return;
    try {
      const value = JSON.parse(line) as { x?: unknown; y?: unknown; confidence?: unknown; type?: unknown; message?: unknown };
      if (value.type === 'status') { this.message = String(value.message || '').slice(0, 240) || this.message; return; }
      const x = Number(value.x); const y = Number(value.y); const confidence = Number(value.confidence ?? 1);
      if (![x, y, confidence].every(Number.isFinite) || x < 0 || x > 1 || y < 0 || y > 1 || confidence < 0 || confidence > 1) return;
      this.samples += 1; this.lastSampleAt = new Date().toISOString(); this.state = 'connected';
      await this.onSample({ x, y, confidence });
    } catch { /* Ignore malformed sidecar diagnostics and keep the stream alive. */ }
  }

  private cleanup(): void { this.lines?.close(); this.lines = undefined; this.process = undefined; }
}
