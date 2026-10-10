import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { ServerResponse } from 'node:http';
import { StageActorAnimation, StageActorPackManifest, StageActorRig, validateStageActorPackManifest } from '@tempest/contracts';

const mediaTypes: Record<string, string> = { '.png': 'image/png', '.webp': 'image/webp' };

export interface ResolvedStageActorAnimation {
  pack: StageActorPackManifest;
  state: string;
  animation: StageActorAnimation;
  assetUrl: string;
  primaryMaskUrl?: string;
  secondaryMaskUrl?: string;
}

export interface ResolvedStageActorRig {
  schemaVersion: 2;
  packId: string;
  canvas: StageActorRig['canvas'];
  template?: StageActorRig['template'];
  bones: StageActorRig['bones'];
  layers: Array<StageActorRig['layers'][number] & { assetUrl: string }>;
  attachments: StageActorRig['attachments'];
  clips: StageActorRig['clips'];
}

function clone<T>(value: T): T { return structuredClone(value); }

function packAssets(pack: StageActorPackManifest): Set<string> {
  return new Set([
    ...(pack.atlas ? [pack.atlas.asset] : []),
    ...Object.values(pack.animations).map((animation) => animation.asset),
    ...(pack.thumbnail ? [pack.thumbnail] : []),
    ...Object.values(pack.appearance?.masks || {}).flatMap((masks) => [masks.primary, masks.secondary]),
    ...(pack.rig?.layers || []).map((layer) => layer.asset),
    ...(pack.rig?.template?.guideAsset ? [pack.rig.template.guideAsset] : [])
  ]);
}

export class TempestStageActorCatalog {
  readonly directory: string;
  private readonly packs = new Map<string, StageActorPackManifest>();
  private diagnostics: string[] = [];

  constructor(dataDirectory: string) {
    this.directory = path.join(dataDirectory, 'stage-actors');
  }

  async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await this.reload();
  }

  async reload(): Promise<{ packs: StageActorPackManifest[]; diagnostics: string[] }> {
    const next = new Map<string, StageActorPackManifest>();
    const diagnostics: string[] = [];
    const entries = await readdir(this.directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(entry.name)) continue;
      try {
        const packDirectory = path.join(this.directory, entry.name);
        const manifest = JSON.parse(await readFile(path.join(packDirectory, 'manifest.json'), 'utf8')) as unknown;
        const validation = validateStageActorPackManifest(manifest);
        if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
        if (validation.value.id !== entry.name) throw new Error('The pack directory must match its manifest ID.');
        const assets = packAssets(validation.value);
        for (const asset of assets) {
          const details = await stat(path.join(packDirectory, asset));
          if (!details.isFile() || details.size < 16 || details.size > 25 * 1024 * 1024) throw new Error(`Asset ${asset} is missing or outside the 25 MB limit.`);
        }
        next.set(validation.value.id, validation.value);
      } catch (error) {
        diagnostics.push(`${entry.name}: ${(error as Error).message}`);
      }
    }
    this.packs.clear();
    for (const [id, manifest] of next) this.packs.set(id, manifest);
    this.diagnostics = diagnostics;
    return this.status();
  }

  status(baseUrl = ''): { packs: Array<StageActorPackManifest & { previewUrl: string }>; diagnostics: string[] } {
    return {
      packs: [...this.packs.values()].map((pack) => ({
        ...clone(pack),
        previewUrl: `${baseUrl}/interactive-stage/actors/${encodeURIComponent(pack.id)}/${encodeURIComponent(pack.thumbnail || pack.animations.idle.asset)}?v=${encodeURIComponent(pack.version)}`
      })),
      diagnostics: [...this.diagnostics]
    };
  }

  find(id: string | undefined): StageActorPackManifest | undefined {
    const pack = id ? this.packs.get(id) : undefined;
    return pack ? clone(pack) : undefined;
  }

  first(): StageActorPackManifest | undefined {
    const pack = this.packs.values().next().value as StageActorPackManifest | undefined;
    return pack ? clone(pack) : undefined;
  }

  async remove(id: string): Promise<boolean> {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)) throw new Error('The Stage Actor pack ID is invalid.');
    if (!this.packs.has(id)) return false;
    await rm(path.join(this.directory, id), { recursive: true, force: false });
    this.packs.delete(id);
    return true;
  }

  resolveAnimation(packId: string | undefined, requestedState: string, baseUrl = ''): ResolvedStageActorAnimation | undefined {
    const pack = packId ? this.packs.get(packId) : undefined;
    if (!pack) return undefined;
    const aliases: Record<string, string[]> = {
      battle: ['attack', 'walk', 'idle'],
      emote: ['emote', 'celebrate', 'idle'],
      sleep: ['sleep', 'sit', 'idle'],
      defeated: ['defeated', 'damaged', 'sleep', 'idle']
    };
    const candidates = [requestedState, ...(aliases[requestedState] || []), 'idle'];
    const state = candidates.find((candidate) => pack.animations[candidate]);
    if (!state) return undefined;
    const animation = pack.animations[state];
    const masks = pack.appearance?.masks[state];
    return {
      pack: clone(pack), state, animation: clone(animation),
      assetUrl: `${baseUrl}/interactive-stage/actors/${encodeURIComponent(pack.id)}/${encodeURIComponent(animation.asset)}?v=${encodeURIComponent(pack.version)}`,
      ...(masks ? {
        primaryMaskUrl: `${baseUrl}/interactive-stage/actors/${encodeURIComponent(pack.id)}/${encodeURIComponent(masks.primary)}?v=${encodeURIComponent(pack.version)}`,
        secondaryMaskUrl: `${baseUrl}/interactive-stage/actors/${encodeURIComponent(pack.id)}/${encodeURIComponent(masks.secondary)}?v=${encodeURIComponent(pack.version)}`
      } : {})
    };
  }

  rendererRig(packId: string, baseUrl = ''): ResolvedStageActorRig | undefined {
    const pack = this.packs.get(packId);
    if (!pack?.rig || pack.schemaVersion !== 2) return undefined;
    return {
      schemaVersion: 2,
      packId: pack.id,
      canvas: clone(pack.rig.canvas),
      ...(pack.rig.template ? { template: clone(pack.rig.template) } : {}),
      bones: clone(pack.rig.bones),
      layers: pack.rig.layers.map((layer) => ({
        ...clone(layer),
        assetUrl: `${baseUrl}/interactive-stage/actors/${encodeURIComponent(pack.id)}/${encodeURIComponent(layer.asset)}?v=${encodeURIComponent(pack.version)}`
      })),
      attachments: clone(pack.rig.attachments),
      clips: clone(pack.rig.clips)
    };
  }

  async serveAsset(packId: string, assetName: string, response: ServerResponse): Promise<boolean> {
    const pack = this.packs.get(packId);
    if (!pack) return false;
    const allowed = packAssets(pack);
    if (!allowed.has(assetName)) return false;
    const contentType = mediaTypes[path.extname(assetName).toLowerCase()];
    if (!contentType) return false;
    const filePath = path.join(this.directory, pack.id, assetName);
    const details = await stat(filePath).catch(() => null);
    if (!details?.isFile()) return false;
    response.statusCode = 200;
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Length', details.size);
    // OBS Browser Source keeps an independent CEF cache. Actor packs can be rebuilt in
    // place with the same manifest version, so stale atlases or masks must never survive
    // a Studio/Browser Source restart.
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    createReadStream(filePath).pipe(response);
    return true;
  }
}
