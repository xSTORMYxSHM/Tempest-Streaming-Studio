import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type TwitchExtensionDestination = 'mainframe' | 'streaming';

export interface TwitchExtensionFeatureDefinition {
  id: string;
  name: string;
  group: string;
  description: string;
  defaultDestinations: TwitchExtensionDestination[];
}

export interface TwitchExtensionFeaturePlacement extends TwitchExtensionFeatureDefinition {
  destinations: TwitchExtensionDestination[];
  customized: boolean;
}

interface TwitchExtensionFeaturePlacementDocument {
  schemaVersion: 1;
  placements: Record<string, TwitchExtensionDestination[]>;
  updatedAt: string;
}

const destinationOrder: TwitchExtensionDestination[] = ['mainframe', 'streaming'];
const idPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;
const clone = <T>(value: T): T => structuredClone(value);

function normalizeDestinations(value: unknown): TwitchExtensionDestination[] {
  if (!Array.isArray(value)) throw new Error('Extension feature destinations must be an array.');
  const destinations = [...new Set(value.map((entry) => String(entry)))] as string[];
  if (destinations.some((entry) => !destinationOrder.includes(entry as TwitchExtensionDestination))) {
    throw new Error('Extension feature destinations may contain only mainframe or streaming.');
  }
  return destinationOrder.filter((entry) => destinations.includes(entry));
}

function sameDestinations(left: TwitchExtensionDestination[], right: TwitchExtensionDestination[]): boolean {
  return destinationOrder.every((entry) => left.includes(entry) === right.includes(entry));
}

export class TempestExtensionFeaturePlacements {
  private readonly filePath: string;
  private placements = new Map<string, TwitchExtensionDestination[]>();

  constructor(dataDirectory: string) {
    this.filePath = path.join(dataDirectory, 'extension-feature-placements.json');
  }

  async initialize(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const document = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<TwitchExtensionFeaturePlacementDocument>;
      if (!document || document.schemaVersion !== 1 || !document.placements || typeof document.placements !== 'object' || Array.isArray(document.placements)) {
        throw new Error('Extension feature placement settings are invalid.');
      }
      for (const [id, destinations] of Object.entries(document.placements)) {
        if (!idPattern.test(id)) continue;
        try { this.placements.set(id, normalizeDestinations(destinations)); } catch { /* Ignore invalid individual legacy entries. */ }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await this.persist();
    }
  }

  destinations(id: string, defaults: readonly TwitchExtensionDestination[]): TwitchExtensionDestination[] {
    return clone(this.placements.get(id) || normalizeDestinations(defaults));
  }

  list(definitions: readonly TwitchExtensionFeatureDefinition[]): TwitchExtensionFeaturePlacement[] {
    return definitions.map((definition) => ({
      ...clone(definition),
      defaultDestinations: normalizeDestinations(definition.defaultDestinations),
      destinations: this.destinations(definition.id, definition.defaultDestinations),
      customized: this.placements.has(definition.id)
    }));
  }

  async update(id: string, value: unknown, definitions: readonly TwitchExtensionFeatureDefinition[]): Promise<TwitchExtensionFeaturePlacement> {
    const definition = definitions.find((entry) => entry.id === id);
    if (!definition) throw new Error(`Extension feature ${id} was not found.`);
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const destinations = normalizeDestinations(source.destinations);
    const defaults = normalizeDestinations(definition.defaultDestinations);
    if (sameDestinations(destinations, defaults)) this.placements.delete(id);
    else this.placements.set(id, destinations);
    await this.persist();
    return {
      ...clone(definition),
      defaultDestinations: defaults,
      destinations,
      customized: this.placements.has(id)
    };
  }

  async reset(definitions: readonly TwitchExtensionFeatureDefinition[]): Promise<TwitchExtensionFeaturePlacement[]> {
    this.placements.clear();
    await this.persist();
    return this.list(definitions);
  }

  private async persist(): Promise<void> {
    const placements = Object.fromEntries([...this.placements.entries()].sort(([left], [right]) => left.localeCompare(right)));
    const document: TwitchExtensionFeaturePlacementDocument = { schemaVersion: 1, placements, updatedAt: new Date().toISOString() };
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.filePath);
  }
}
