import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  TempestApplicationManifest,
  TempestAssetManifest,
  TempestWorkflowDefinition,
  validateApplicationManifest,
  validateAssetManifest,
  validateWorkflowDefinition
} from '@tempest/contracts';

interface RegistryDocument {
  schemaVersion: 1;
  applications: TempestApplicationManifest[];
  assets: TempestAssetManifest[];
  workflows: TempestWorkflowDefinition[];
  updatedAt: string;
}

function emptyRegistry(): RegistryDocument {
  return { schemaVersion: 1, applications: [], assets: [], workflows: [], updatedAt: new Date().toISOString() };
}

export class TempestRegistry {
  private document: RegistryDocument = emptyRegistry();
  private writeQueue = Promise.resolve();

  constructor(private readonly dataDirectory: string) {}

  get filePath(): string {
    return path.join(this.dataDirectory, 'registry.json');
  }

  async initialize(): Promise<void> {
    await mkdir(this.dataDirectory, { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<RegistryDocument>;
      const applications = (Array.isArray(parsed.applications) ? parsed.applications : [])
        .map((entry) => validateApplicationManifest(entry))
        .filter((result) => result.ok && result.value)
        .map((result) => result.value as TempestApplicationManifest);
      const assets = (Array.isArray(parsed.assets) ? parsed.assets : [])
        .map((entry) => validateAssetManifest(entry))
        .filter((result) => result.ok && result.value)
        .map((result) => result.value as TempestAssetManifest);
      const workflows = (Array.isArray(parsed.workflows) ? parsed.workflows : [])
        .map((entry) => validateWorkflowDefinition(entry))
        .filter((result) => result.ok && result.value)
        .map((result) => result.value as TempestWorkflowDefinition);
      this.document = {
        schemaVersion: 1,
        applications,
        assets,
        workflows,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString()
      };
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
      if (!missing) throw new Error(`Could not read the Tempest registry: ${(error as Error).message}`);
      await this.persist();
    }
  }

  listApplications(): TempestApplicationManifest[] {
    return this.document.applications.map((entry) => structuredClone(entry));
  }

  listAssets(): TempestAssetManifest[] {
    return this.document.assets.map((entry) => structuredClone(entry));
  }

  listWorkflows(): TempestWorkflowDefinition[] {
    return this.document.workflows.map((entry) => structuredClone(entry));
  }

  async registerApplication(input: unknown): Promise<TempestApplicationManifest> {
    const validation = validateApplicationManifest(input);
    if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
    const now = new Date().toISOString();
    const existing = this.document.applications.find((entry) => entry.id === validation.value?.id);
    const application: TempestApplicationManifest = {
      ...validation.value,
      registeredAt: existing?.registeredAt || now,
      updatedAt: now
    };
    this.document.applications = [
      application,
      ...this.document.applications.filter((entry) => entry.id !== application.id)
    ].sort((left, right) => left.name.localeCompare(right.name));
    await this.persist();
    return structuredClone(application);
  }

  async removeApplication(id: string): Promise<boolean> {
    const initialLength = this.document.applications.length;
    this.document.applications = this.document.applications.filter((entry) => entry.id !== id);
    if (this.document.applications.length === initialLength) return false;
    await this.persist();
    return true;
  }

  async registerAsset(input: unknown): Promise<TempestAssetManifest> {
    const validation = validateAssetManifest(input);
    if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
    const now = new Date().toISOString();
    const existing = this.document.assets.find((entry) => entry.id === validation.value?.id);
    const asset: TempestAssetManifest = {
      ...validation.value,
      registeredAt: existing?.registeredAt || now,
      updatedAt: now
    };
    this.document.assets = [asset, ...this.document.assets.filter((entry) => entry.id !== asset.id)]
      .sort((left, right) => left.name.localeCompare(right.name));
    await this.persist();
    return structuredClone(asset);
  }

  async removeAsset(id: string): Promise<boolean> {
    const initialLength = this.document.assets.length;
    this.document.assets = this.document.assets.filter((entry) => entry.id !== id);
    if (this.document.assets.length === initialLength) return false;
    await this.persist();
    return true;
  }

  async registerWorkflow(input: unknown): Promise<TempestWorkflowDefinition> {
    const validation = validateWorkflowDefinition(input);
    if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
    const now = new Date().toISOString();
    const existing = this.document.workflows.find((entry) => entry.id === validation.value?.id);
    const workflow: TempestWorkflowDefinition = {
      ...validation.value,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    this.document.workflows = [workflow, ...this.document.workflows.filter((entry) => entry.id !== workflow.id)]
      .sort((left, right) => left.name.localeCompare(right.name));
    await this.persist();
    return structuredClone(workflow);
  }

  async removeWorkflow(id: string): Promise<boolean> {
    const initialLength = this.document.workflows.length;
    this.document.workflows = this.document.workflows.filter((entry) => entry.id !== id);
    if (this.document.workflows.length === initialLength) return false;
    await this.persist();
    return true;
  }

  private async persist(): Promise<void> {
    this.document.updatedAt = new Date().toISOString();
    const serialized = `${JSON.stringify(this.document, null, 2)}\n`;
    this.writeQueue = this.writeQueue.then(() => writeFile(this.filePath, serialized, { encoding: 'utf8', mode: 0o600 }));
    await this.writeQueue;
  }
}
