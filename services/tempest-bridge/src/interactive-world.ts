import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  AvatarChannelPointEffect,
  AvatarChannelPointRedeem,
  AvatarSessionRedemption,
  INTERACTIVE_WORLD_SCHEMA_VERSION,
  InteractiveBattleParticipant,
  InteractiveBattleSession,
  InteractiveGazeState,
  InteractivePresencePolicy,
  InteractivePetState,
  InteractiveViewerCosmetics,
  InteractiveViewerControlAction,
  InteractiveViewerProfile,
  InteractiveWorldPlatform,
  InteractiveWorldSafetyPolicy,
  InteractiveWorldState,
  PetAction,
  TempestNormalizedTwitchEvent,
  TempestNormalizedChatEvent,
  ViewerAvatarState
} from '@tempest/contracts';
import { TempestInteractiveStage } from './interactive-stage';
import { TempestStageActorCatalog } from './stage-actors';

const viewerStates = new Set<ViewerAvatarState>(['idle', 'walk', 'jump', 'sit', 'sleep', 'celebrate', 'emote']);
const viewerControls = new Set<InteractiveViewerControlAction>(['left', 'right', 'jump', 'drop', 'interact', 'emote', 'unstuck']);
const petActions = new Set<PetAction>(['feed', 'pet', 'play', 'annoy', 'wake', 'sleep', 'dress', 'call', 'dismiss']);
const colorPattern = /^#[0-9a-f]{6}$/i;
const avatarRedeemEffects = new Set<AvatarChannelPointEffect>(['primary-color', 'secondary-color', 'accessory', 'title', 'emote', 'celebrate']);

interface AvatarSessionOverride {
  primaryColor?: string;
  secondaryColor?: string;
  title?: string;
  accessories?: string[];
  state?: ViewerAvatarState;
}

const defaultPresence = (): InteractivePresencePolicy => ({
  enabled: true,
  avatarScale: 1,
  minimumMessages: 1,
  messageWindowMs: 10 * 60_000,
  inactiveAfterMs: 20 * 60_000,
  removeFromStageAfterMs: 45 * 60_000
});

const defaultSafety = (): InteractiveWorldSafetyPolicy => ({
  interactionsEnabled: true,
  maximumCrowd: 30,
  maximumStageObjects: 60,
  maximumConcurrentEffects: 8,
  minimumAttackCooldownMs: 1_500,
  minimumJumpscareCooldownMs: 60_000,
  allowJumpscares: true,
  reducedMotion: false,
  reducedFlashing: true,
  volumeCeiling: 0.8
});

const defaultPet = (): InteractivePetState => ({
  enabled: false,
  name: 'Nimbus',
  mood: 75,
  energy: 80,
  hunger: 25,
  level: 1,
  affinity: 0,
  state: 'idle',
  updatedAt: new Date().toISOString()
});

const defaultGaze = (): InteractiveGazeState => ({
  enabled: false,
  connected: false,
  adapter: 'none',
  x: 0.5,
  y: 0.5,
  confidence: 0,
  effect: 'cursor',
  calibration: { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 },
  updatedAt: new Date().toISOString()
});

function clone<T>(value: T): T { return structuredClone(value); }
function bounded(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}
function text(value: unknown, fallback: string, maximum = 80): string {
  const result = String(value ?? '').trim();
  return (result || fallback).slice(0, maximum);
}
function viewerKey(platform: InteractiveWorldPlatform, userId: string): string { return `${platform}:${userId}`; }
function safeId(value: string): string { return value.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 120); }
function randomPaletteColor(slot: { options: Array<{ color: string }> } | undefined, fallback: string): string {
  const options = slot?.options.filter((option) => colorPattern.test(option.color)) || [];
  if (!options.length) return fallback;
  return options[Math.floor(Math.random() * options.length)].color.toUpperCase();
}

export class TempestInteractiveWorld {
  private readonly filePath: string;
  private readonly attackTimes = new Map<string, number>();
  private readonly observedMessages = new Map<string, number[]>();
  private readonly viewerControlSequences = new Map<string, number>();
  private readonly avatarSessionOverrides = new Map<string, AvatarSessionOverride>();
  private readonly avatarSessionStateTimers = new Map<string, NodeJS.Timeout>();
  private avatarSessionRedemptions: AvatarSessionRedemption[] = [];
  private sweepTimer?: NodeJS.Timeout;
  private gazeDisconnectTimer?: NodeJS.Timeout;
  private gazeLastSampleMs = 0;
  private stateValue: InteractiveWorldState = {
    schemaVersion: INTERACTIVE_WORLD_SCHEMA_VERSION,
    revision: 0,
    updatedAt: new Date().toISOString(),
    safety: defaultSafety(),
    presence: defaultPresence(),
    avatarChannelPointRedeems: [],
    viewers: [],
    pet: defaultPet(),
    gaze: defaultGaze()
  };

  constructor(dataDirectory: string, private readonly stage: TempestInteractiveStage, private readonly actors: TempestStageActorCatalog) {
    this.filePath = path.join(dataDirectory, 'interactive-world.json');
  }

  async initialize(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<InteractiveWorldState>;
      if (parsed.schemaVersion !== INTERACTIVE_WORLD_SCHEMA_VERSION) throw new Error('Unsupported Interactive World data version.');
      this.stateValue = {
        schemaVersion: INTERACTIVE_WORLD_SCHEMA_VERSION,
        revision: Number.isInteger(parsed.revision) ? Number(parsed.revision) : 0,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
        safety: { ...defaultSafety(), ...(parsed.safety || {}) },
        presence: { ...defaultPresence(), ...(parsed.presence || {}) },
        avatarChannelPointRedeems: Array.isArray(parsed.avatarChannelPointRedeems) ? parsed.avatarChannelPointRedeems.slice(0, 24) : [],
        viewers: Array.isArray(parsed.viewers) ? parsed.viewers.slice(0, 100).filter((entry) => entry && typeof entry.key === 'string').map((entry) => ({ ...entry, presence: entry.presence || 'active', onStage: entry.onStage !== false, messageCount: Number(entry.messageCount || 0), cosmetics: entry.cosmetics || { primaryColor: entry.accent || '#54F2EB', secondaryColor: '#B99CFF', title: entry.title, accessories: entry.accessory ? [entry.accessory] : [], layers: [] } })) as InteractiveViewerProfile[] : [],
        pet: { ...defaultPet(), ...(parsed.pet || {}) },
        gaze: { ...defaultGaze(), ...(parsed.gaze || {}), connected: false },
        ...(parsed.battle && ['waiting', 'active'].includes(parsed.battle.state) ? { battle: { ...parsed.battle, state: 'cancelled', updatedAt: new Date().toISOString() } as InteractiveBattleSession } : parsed.battle ? { battle: parsed.battle } : {})
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await this.persist();
    }
    if (this.stateValue.safety.interactionsEnabled && this.stateValue.viewers.some((viewer) => viewer.onStage !== false)) await this.stage.ensureAvatarFloor();
    this.syncPersistentStage();
    this.sweepTimer = setInterval(() => { void this.sweepPresence(); }, 30_000);
    this.sweepTimer.unref?.();
  }

  status(): InteractiveWorldState & { activeViewers: number; savedViewerProfiles: number; battleActive: boolean; avatarRewardSession: { activeViewerCount: number; redemptions: AvatarSessionRedemption[] } } {
    return {
      ...clone(this.stateValue),
      activeViewers: this.stateValue.viewers.filter((viewer) => viewer.onStage !== false && viewer.presence !== 'inactive').length,
      savedViewerProfiles: this.stateValue.viewers.length,
      battleActive: this.stateValue.battle?.state === 'active',
      avatarRewardSession: { activeViewerCount: this.avatarSessionOverrides.size, redemptions: clone(this.avatarSessionRedemptions) }
    };
  }

  async configureAvatarChannelPointRedeems(input: unknown): Promise<AvatarChannelPointRedeem[]> {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    if (!Array.isArray(source.redeems)) throw new Error('Avatar Channel Point redeems must be provided as a list.');
    const seenIds = new Set<string>();
    const redeems = source.redeems.slice(0, 24).map((entry, index): AvatarChannelPointRedeem => {
      const item = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
      const id = safeId(text(item.id, `avatar-redeem-${index + 1}`, 64));
      if (!id || seenIds.has(id)) throw new Error('Every avatar redeem needs a unique ID.');
      seenIds.add(id);
      const rewardId = text(item.rewardId, '', 160) || undefined;
      const rewardTitle = text(item.rewardTitle, '', 300) || undefined;
      if (!rewardId && !rewardTitle) throw new Error('Each avatar redeem must match a Twitch reward ID or exact reward title.');
      const effect = String(item.effect || '') as AvatarChannelPointEffect;
      if (!avatarRedeemEffects.has(effect)) throw new Error(`Avatar redeem effect must be one of: ${[...avatarRedeemEffects].join(', ')}.`);
      const requestedPersistence = item.persistence === 'profile' ? 'profile' : 'session';
      const persistence = effect === 'emote' || effect === 'celebrate' ? 'session' : requestedPersistence;
      let value = text(item.value, '', effect === 'title' ? 80 : 40) || undefined;
      if (effect === 'primary-color' || effect === 'secondary-color') {
        if (!value || !colorPattern.test(value)) throw new Error(`${effect === 'primary-color' ? 'Primary' : 'Secondary'} color redeems require a six-digit hex color.`);
        value = value.toUpperCase();
      }
      if (['accessory', 'title'].includes(effect) && !value) throw new Error(`${effect === 'accessory' ? 'Accessory' : 'Title'} redeems require a value.`);
      return { id, name: text(item.name, rewardTitle || `Avatar Redeem ${index + 1}`, 80), ...(rewardId ? { rewardId } : {}), ...(rewardTitle ? { rewardTitle } : {}), effect, ...(value ? { value } : {}), persistence, enabled: item.enabled !== false };
    });
    this.stateValue.avatarChannelPointRedeems = redeems;
    await this.touch();
    return clone(redeems);
  }

  async applyAvatarChannelPointRedemption(event: TempestNormalizedTwitchEvent): Promise<AvatarSessionRedemption | undefined> {
    if (event.topic !== 'viewer.reward.redeemed' || !event.viewer?.id || !this.stateValue.safety.interactionsEnabled) return undefined;
    const rewardId = String(event.payload.rewardId || '').trim();
    const rewardTitle = String(event.payload.rewardTitle || '').trim();
    const redeem = (this.stateValue.avatarChannelPointRedeems || []).find((entry) => entry.enabled && ((entry.rewardId && entry.rewardId === rewardId) || (entry.rewardTitle && entry.rewardTitle.localeCompare(rewardTitle, undefined, { sensitivity: 'accent' }) === 0)));
    if (!redeem) return undefined;
    const viewer = await this.joinViewer({ platform: 'twitch', userId: event.viewer.id, displayName: event.viewer.displayName || event.viewer.login || 'Viewer' });
    const persistence = redeem.persistence === 'profile' && !['emote', 'celebrate'].includes(redeem.effect) ? 'profile' : 'session';
    const current = this.avatarSessionOverrides.get(viewer.key) || {};
    if (persistence === 'profile') {
      const storedViewer = this.requireViewer(viewer.key);
      storedViewer.unlockedAvatarRedeemIds = [...new Set([...(storedViewer.unlockedAvatarRedeemIds || []), redeem.id])].slice(-100);
      const cosmetics = viewer.cosmetics || { primaryColor: viewer.accent, secondaryColor: '#B99CFF', accessories: [], layers: [] };
      await this.setViewerCosmetics(viewer.key, {
        ...cosmetics,
        primaryColor: redeem.effect === 'primary-color' ? redeem.value : cosmetics.primaryColor,
        secondaryColor: redeem.effect === 'secondary-color' ? redeem.value : cosmetics.secondaryColor,
        title: redeem.effect === 'title' ? redeem.value : cosmetics.title,
        accessories: redeem.effect === 'accessory' && redeem.value ? [...new Set([...cosmetics.accessories, redeem.value])].slice(-4) : cosmetics.accessories
      });
    } else {
      if (redeem.effect === 'primary-color') current.primaryColor = redeem.value;
      if (redeem.effect === 'secondary-color') current.secondaryColor = redeem.value;
      if (redeem.effect === 'title') current.title = redeem.value;
      if (redeem.effect === 'accessory' && redeem.value) {
        const persistent = viewer.cosmetics?.accessories || [];
        current.accessories = [...new Set([...(current.accessories || persistent), redeem.value])].slice(-4);
      }
      if (redeem.effect === 'emote' || redeem.effect === 'celebrate') current.state = redeem.effect;
      this.avatarSessionOverrides.set(viewer.key, current);
      this.stage.dismiss(this.avatarObjectId(viewer.key), 'avatar-channel-point-redeem');
      this.renderViewer(viewer);
    }
    if (persistence === 'session' && current.state) {
      const previousTimer = this.avatarSessionStateTimers.get(viewer.key);
      if (previousTimer) clearTimeout(previousTimer);
      const timer = setTimeout(() => {
        const active = this.avatarSessionOverrides.get(viewer.key);
        if (active) { delete active.state; this.avatarSessionOverrides.set(viewer.key, active); }
        const storedViewer = this.stateValue.viewers.find((entry) => entry.key === viewer.key);
        if (storedViewer) this.renderViewer(storedViewer);
        this.avatarSessionStateTimers.delete(viewer.key);
      }, 4_000);
      timer.unref?.();
      this.avatarSessionStateTimers.set(viewer.key, timer);
    }
    const applied: AvatarSessionRedemption = {
      id: String(event.payload.redemptionId || event.id), redeemId: redeem.id, ...(rewardId ? { rewardId } : {}), ...(rewardTitle ? { rewardTitle } : {}),
      viewerKey: viewer.key, viewerName: viewer.displayName, effect: redeem.effect, ...(redeem.value ? { value: redeem.value } : {}), persistence, appliedAt: event.occurredAt
    };
    this.avatarSessionRedemptions = [applied, ...this.avatarSessionRedemptions].slice(0, 100);
    await this.touch(false);
    return clone(applied);
  }

  avatarCloset(viewerIdValue: unknown): { viewerKey: string; viewerName?: string; equipped: InteractiveViewerCosmetics | null; items: Array<AvatarChannelPointRedeem & { owned: boolean; equipped: boolean }> } {
    const viewerId = safeId(text(viewerIdValue, '', 128));
    if (!viewerId) throw new Error('A linked Twitch viewer identity is required for the avatar closet.');
    const key = viewerKey('twitch', viewerId);
    const viewer = this.stateValue.viewers.find((entry) => entry.key === key);
    const cosmetics = viewer?.cosmetics;
    const owned = new Set(viewer?.unlockedAvatarRedeemIds || []);
    const items = (this.stateValue.avatarChannelPointRedeems || [])
      .filter((entry) => entry.enabled && entry.persistence === 'profile' && !['emote', 'celebrate'].includes(entry.effect))
      .map((entry) => ({
        ...clone(entry),
        owned: owned.has(entry.id),
        equipped: entry.effect === 'primary-color' ? cosmetics?.primaryColor === entry.value
          : entry.effect === 'secondary-color' ? cosmetics?.secondaryColor === entry.value
            : entry.effect === 'title' ? cosmetics?.title === entry.value
              : entry.effect === 'accessory' ? Boolean(entry.value && cosmetics?.accessories.includes(entry.value))
                : false
      }));
    return { viewerKey: key, viewerName: viewer?.displayName, equipped: cosmetics ? clone(cosmetics) : null, items };
  }

  async equipUnlockedAvatarRedeem(viewerIdValue: unknown, redeemIdValue: unknown): Promise<InteractiveViewerProfile> {
    const viewerId = safeId(text(viewerIdValue, '', 128));
    const redeemId = safeId(text(redeemIdValue, '', 64));
    if (!viewerId || !redeemId) throw new Error('A linked Twitch viewer and cosmetic selection are required.');
    const viewer = this.requireViewer(viewerKey('twitch', viewerId));
    if (!(viewer.unlockedAvatarRedeemIds || []).includes(redeemId)) throw new Error('That cosmetic has not been unlocked by this viewer.');
    const redeem = (this.stateValue.avatarChannelPointRedeems || []).find((entry) => entry.id === redeemId && entry.enabled && entry.persistence === 'profile');
    if (!redeem || ['emote', 'celebrate'].includes(redeem.effect)) throw new Error('That saved cosmetic is no longer available in the avatar closet.');
    const cosmetics = viewer.cosmetics || { primaryColor: viewer.accent, secondaryColor: '#B99CFF', accessories: [], layers: [] };
    return this.setViewerCosmetics(viewer.key, {
      ...cosmetics,
      primaryColor: redeem.effect === 'primary-color' ? redeem.value : cosmetics.primaryColor,
      secondaryColor: redeem.effect === 'secondary-color' ? redeem.value : cosmetics.secondaryColor,
      title: redeem.effect === 'title' ? redeem.value : cosmetics.title,
      accessories: redeem.effect === 'accessory' && redeem.value ? [...new Set([...cosmetics.accessories, redeem.value])].slice(-4) : cosmetics.accessories
    });
  }

  async resetAvatarRewardSession(): Promise<number> {
    const affected = this.avatarSessionOverrides.size;
    for (const timer of this.avatarSessionStateTimers.values()) clearTimeout(timer);
    this.avatarSessionStateTimers.clear();
    this.avatarSessionOverrides.clear();
    this.avatarSessionRedemptions = [];
    for (const viewer of this.stateValue.viewers.filter((entry) => entry.onStage !== false)) {
      this.stage.dismiss(this.avatarObjectId(viewer.key), 'avatar-reward-session-reset');
      this.renderViewer(viewer);
    }
    await this.touch(false);
    return affected;
  }

  async updatePresence(input: unknown): Promise<InteractiveWorldState> {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const current = this.stateValue.presence || defaultPresence();
    this.stateValue.presence = {
      enabled: source.enabled === undefined ? current.enabled : source.enabled === true,
      avatarScale: bounded(source.avatarScale, current.avatarScale, 0.5, 2),
      minimumMessages: Math.round(bounded(source.minimumMessages, current.minimumMessages, 1, 20)),
      messageWindowMs: Math.round(bounded(source.messageWindowMs, current.messageWindowMs, 10_000, 24 * 60 * 60_000)),
      inactiveAfterMs: Math.round(bounded(source.inactiveAfterMs, current.inactiveAfterMs, 30_000, 7 * 24 * 60 * 60_000)),
      removeFromStageAfterMs: Math.round(bounded(source.removeFromStageAfterMs, current.removeFromStageAfterMs, 60_000, 30 * 24 * 60 * 60_000))
    };
    for (const viewer of this.stateValue.viewers.filter((entry) => entry.onStage !== false)) this.renderViewer(viewer);
    if (this.stateValue.battle && ['waiting', 'active'].includes(this.stateValue.battle.state)) this.renderBattle();
    await this.touch();
    return this.status();
  }

  refreshActorPackRenders(): number {
    const viewers = this.stateValue.viewers
      .filter((entry) => entry.onStage !== false)
      .slice(0, this.stateValue.safety.maximumCrowd)
      .filter((entry) => Boolean(entry.actorPackId));
    for (const viewer of viewers) this.renderViewer(viewer);
    if (this.stateValue.battle && ['waiting', 'active'].includes(this.stateValue.battle.state)) this.renderBattle();
    return viewers.length;
  }

  async observeChat(event: TempestNormalizedChatEvent): Promise<InteractiveViewerProfile | undefined> {
    const policy = this.stateValue.presence || defaultPresence();
    if (!policy.enabled || event.topic !== 'viewer.chat.message' || !event.viewer?.id || !this.stateValue.safety.interactionsEnabled) return undefined;
    const platform = event.source === 'kick' ? 'kick' : 'twitch';
    const userId = safeId(event.viewer.id);
    if (!userId) return undefined;
    const key = viewerKey(platform, userId);
    const occurredAt = Number.isFinite(Date.parse(event.occurredAt)) ? Date.parse(event.occurredAt) : Date.now();
    const existing = this.stateValue.viewers.find((viewer) => viewer.key === key);
    const recent = [...(this.observedMessages.get(key) || []), occurredAt].filter((value) => occurredAt - value <= policy.messageWindowMs).slice(-policy.minimumMessages);
    this.observedMessages.set(key, recent);
    if (!existing && recent.length < policy.minimumMessages) return undefined;
    const viewer = await this.joinViewer({ platform, userId, displayName: event.viewer.displayName || event.viewer.login || 'Viewer', lastSeenAt: new Date(occurredAt).toISOString(), automaticPresence: true });
    viewer.messageCount = (existing?.messageCount || 0) + 1;
    viewer.presence = 'active';
    viewer.onStage = true;
    delete viewer.inactiveAt;
    viewer.lastSeenAt = new Date(occurredAt).toISOString();
    const stored = this.requireViewer(key);
    Object.assign(stored, viewer);
    this.renderViewer(stored);
    await this.touch();
    return clone(stored);
  }

  async handleGameChat(event: TempestNormalizedChatEvent): Promise<string | undefined> {
    if (event.topic !== 'viewer.chat.message' || !event.viewer?.id) return undefined;
    const input = String(event.payload.text || '').trim();
    const [command, ...argumentsList] = input.split(/\s+/);
    if (!command?.startsWith('!')) return undefined;
    const platform: InteractiveWorldPlatform = event.source === 'kick' ? 'kick' : 'twitch';
    const viewer = this.stateValue.viewers.find((entry) => entry.key === viewerKey(platform, safeId(event.viewer!.id)));
    if (!viewer) return undefined;
    const movementCommands: Record<string, InteractiveViewerControlAction> = { '!left': 'left', '!right': 'right', '!jump': 'jump', '!drop': 'drop', '!interact': 'interact', '!emote': 'emote', '!unstuck': 'unstuck' };
    const movementAction = movementCommands[command.toLowerCase()];
    if (movementAction) { await this.controlViewer(viewer.key, { action: movementAction }); return `avatar-${movementAction}`; }
    if (command.toLowerCase() === '!duel') {
      const targetName = argumentsList.join(' ').replace(/^@/, '').toLowerCase();
      const target = this.stateValue.viewers.find((entry) => entry.key !== viewer.key && entry.displayName.toLowerCase() === targetName);
      if (!target) throw new Error('The duel target does not have an active avatar.');
      await this.startBattle({ mode: 'duel', viewerKeys: [viewer.key, target.key], inviteOnly: true });
      return 'duel-invited';
    }
    if (command.toLowerCase() === '!accept') { await this.acceptBattle(viewer.key); return 'battle-accepted'; }
    if (['!attack', '!heal', '!shield', '!roll'].includes(command.toLowerCase())) {
      const battle = this.stateValue.battle;
      if (!battle?.participants.some((participant) => participant.viewerKey === viewer.key)) throw new Error('That viewer is not in the active game.');
      const action = command.toLowerCase() === '!roll' ? 'attack' : command.slice(1).toLowerCase();
      const targetKey = action === 'attack' ? battle.boss?.viewerKey || battle.participants.find((participant) => participant.viewerKey !== viewer.key && !participant.defeated)?.viewerKey : viewer.key;
      await this.battleAction({ action, attackerKey: viewer.key, targetKey });
      return action;
    }
    return undefined;
  }

  async sweepPresence(now = Date.now()): Promise<{ inactive: number; removedFromStage: number }> {
    const policy = this.stateValue.presence || defaultPresence();
    let inactive = 0;
    let removedFromStage = 0;
    let changed = false;
    for (const viewer of this.stateValue.viewers) {
      if (viewer.platform === 'studio') continue;
      const age = now - Date.parse(viewer.lastSeenAt);
      if (age >= policy.removeFromStageAfterMs && viewer.onStage !== false) {
        viewer.presence = 'inactive'; viewer.onStage = false; viewer.inactiveAt ||= new Date(now).toISOString();
        this.stage.dismiss(this.avatarObjectId(viewer.key), 'viewer-inactive');
        removedFromStage += 1; changed = true;
      } else if (age >= policy.inactiveAfterMs && viewer.presence !== 'inactive') {
        viewer.presence = 'inactive'; viewer.avatarState = 'sleep'; viewer.inactiveAt = new Date(now).toISOString();
        if (viewer.onStage !== false) this.renderViewer(viewer);
        inactive += 1; changed = true;
      }
    }
    this.sweepBattle(now);
    if (this.stateValue.gaze.connected && now - this.gazeLastSampleMs > 2_500) {
      this.stateValue.gaze.connected = false; this.stateValue.gaze.confidence = 0; this.stateValue.gaze.updatedAt = new Date(now).toISOString();
      this.stage.dismiss('sensor:gaze', 'gaze-signal-stale'); changed = true;
    }
    if (changed) await this.touch();
    return { inactive, removedFromStage };
  }

  async updateSafety(input: unknown): Promise<InteractiveWorldState> {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const current = this.stateValue.safety;
    const wasEnabled = current.interactionsEnabled;
    this.stateValue.safety = {
      interactionsEnabled: source.interactionsEnabled === undefined ? current.interactionsEnabled : source.interactionsEnabled === true,
      maximumCrowd: Math.round(bounded(source.maximumCrowd, current.maximumCrowd, 1, 100)),
      maximumStageObjects: Math.round(bounded(source.maximumStageObjects, current.maximumStageObjects, 5, 200)),
      maximumConcurrentEffects: Math.round(bounded(source.maximumConcurrentEffects, current.maximumConcurrentEffects, 1, 30)),
      minimumAttackCooldownMs: Math.round(bounded(source.minimumAttackCooldownMs, current.minimumAttackCooldownMs, 250, 300_000)),
      minimumJumpscareCooldownMs: Math.round(bounded(source.minimumJumpscareCooldownMs, current.minimumJumpscareCooldownMs, 5_000, 3_600_000)),
      allowJumpscares: source.allowJumpscares === undefined ? current.allowJumpscares : source.allowJumpscares === true,
      reducedMotion: source.reducedMotion === undefined ? current.reducedMotion : source.reducedMotion === true,
      reducedFlashing: source.reducedFlashing === undefined ? current.reducedFlashing : source.reducedFlashing === true,
      volumeCeiling: bounded(source.volumeCeiling, current.volumeCeiling, 0, 1)
    };
    while (this.stateValue.viewers.length > this.stateValue.safety.maximumCrowd) {
      const viewer = this.stateValue.viewers.pop();
      if (viewer) this.stage.dismiss(this.avatarObjectId(viewer.key), 'crowd-limit');
    }
    if (!wasEnabled && this.stateValue.safety.interactionsEnabled) this.syncPersistentStage();
    await this.touch();
    return this.status();
  }

  async joinViewer(input: unknown): Promise<InteractiveViewerProfile> {
    if (!this.stateValue.safety.interactionsEnabled) throw new Error('Interactive World is paused by the safety policy.');
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const platform = ['twitch', 'kick', 'studio'].includes(String(source.platform)) ? String(source.platform) as InteractiveWorldPlatform : 'studio';
    const userId = safeId(text(source.userId, globalThis.crypto.randomUUID(), 128));
    const key = viewerKey(platform, userId);
    const existing = this.stateValue.viewers.find((entry) => entry.key === key);
    const requestedActorPackId = text(source.actorPackId, existing?.actorPackId || '', 64);
    if (requestedActorPackId && !this.actors.find(requestedActorPackId)) throw new Error(`Stage Actor pack ${requestedActorPackId} was not found.`);
    const actorPackId = requestedActorPackId || existing?.actorPackId || this.actors.first()?.id;
    const actorPack = this.actors.find(actorPackId);
    const primarySlot = actorPack?.appearance?.colorSlots.primary;
    const secondarySlot = actorPack?.appearance?.colorSlots.secondary;
    const defaultPrimary = primarySlot?.options.find((option) => option.id === primarySlot.defaultOptionId)?.color || existing?.accent || '#54F2EB';
    const defaultSecondary = secondarySlot?.options.find((option) => option.id === secondarySlot.defaultOptionId)?.color || '#B99CFF';
    const requestedAccent = colorPattern.test(String(source.accent || '')) ? String(source.accent).toUpperCase() : undefined;
    const initialPrimary = platform === 'studio' && requestedAccent ? requestedAccent : randomPaletteColor(primarySlot, defaultPrimary);
    const initialSecondary = randomPaletteColor(secondarySlot, defaultSecondary);
    const cosmetics = existing?.cosmetics || {
      primaryColor: initialPrimary,
      secondaryColor: initialSecondary,
      accessories: existing?.accessory ? [existing.accessory] : [],
      layers: [],
      ...(existing?.title ? { title: existing.title } : {})
    };
    const now = typeof source.lastSeenAt === 'string' && Number.isFinite(Date.parse(source.lastSeenAt)) ? new Date(source.lastSeenAt).toISOString() : new Date().toISOString();
    const profile: InteractiveViewerProfile = {
      key,
      platform,
      userId,
      displayName: text(source.displayName, existing?.displayName || 'Viewer'),
      accent: existing?.accent || cosmetics.primaryColor,
      avatarState: viewerStates.has(source.avatarState as ViewerAvatarState) ? source.avatarState as ViewerAvatarState : existing?.avatarState || 'idle',
      ...(actorPackId ? { actorPackId } : {}),
      ...(text(source.accessory, existing?.accessory || '', 80) ? { accessory: text(source.accessory, existing?.accessory || '', 80) } : {}),
      ...(text(source.title, existing?.title || '', 80) ? { title: text(source.title, existing?.title || '', 80) } : {}),
      presence: 'active',
      onStage: true,
      messageCount: existing?.messageCount || 0,
      cosmetics,
      ...(existing?.unlockedAvatarRedeemIds?.length ? { unlockedAvatarRedeemIds: [...existing.unlockedAvatarRedeemIds] } : {}),
      joinedAt: existing?.joinedAt || now,
      lastSeenAt: now
    };
    if (existing) this.stateValue.viewers.splice(this.stateValue.viewers.indexOf(existing), 1, profile);
    else {
      if (this.stateValue.viewers.length >= this.stateValue.safety.maximumCrowd) throw new Error(`The crowd limit of ${this.stateValue.safety.maximumCrowd} is active.`);
      this.stateValue.viewers.push(profile);
    }
    await this.stage.ensureAvatarFloor();
    this.renderViewer(profile);
    await this.touch();
    return clone(profile);
  }

  async setViewerState(key: string, input: unknown): Promise<InteractiveViewerProfile> {
    const viewer = this.requireViewer(key);
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const avatarState = String(source.state || source.avatarState || '');
    if (!viewerStates.has(avatarState as ViewerAvatarState)) throw new Error(`Viewer state must be one of: ${[...viewerStates].join(', ')}.`);
    viewer.avatarState = avatarState as ViewerAvatarState;
    viewer.lastSeenAt = new Date().toISOString();
    this.renderViewer(viewer);
    await this.touch();
    return clone(viewer);
  }

  async controlViewer(key: string, input: unknown): Promise<{ viewer: InteractiveViewerProfile; action: InteractiveViewerControlAction; sequence: number }> {
    if (!this.stateValue.safety.interactionsEnabled) throw new Error('Interactive World is paused by the safety policy.');
    const viewer = this.requireViewer(key);
    if (viewer.onStage === false) throw new Error('That viewer avatar is not currently on the Stage.');
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const action = String(source.action || '') as InteractiveViewerControlAction;
    if (!viewerControls.has(action)) throw new Error(`Viewer control must be one of: ${[...viewerControls].join(', ')}.`);
    const sequence = (this.viewerControlSequences.get(key) || 0) + 1;
    this.viewerControlSequences.set(key, sequence);
    viewer.presence = 'active';
    viewer.lastSeenAt = new Date().toISOString();
    this.renderViewer(viewer, { action, sequence });
    await this.touch(false);
    return { viewer: clone(viewer), action, sequence };
  }

  async setViewerActor(key: string, input: unknown): Promise<InteractiveViewerProfile> {
    const viewer = this.requireViewer(key);
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const actorPackId = text(source.actorPackId, '', 64);
    if (actorPackId && !this.actors.find(actorPackId)) throw new Error(`Stage Actor pack ${actorPackId} was not found.`);
    if (actorPackId) viewer.actorPackId = actorPackId;
    else delete viewer.actorPackId;
    viewer.lastSeenAt = new Date().toISOString();
    // Actor packs change the complete render asset/property set. Recreate the Stage
    // object so fields from the previous pack cannot survive the normal merge update.
    this.stage.dismiss(this.avatarObjectId(viewer.key), 'actor-pack-changed');
    this.renderViewer(viewer);
    await this.touch();
    return clone(viewer);
  }

  async setViewerCosmetics(key: string, input: unknown): Promise<InteractiveViewerProfile> {
    const viewer = this.requireViewer(key);
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const current = viewer.cosmetics || { primaryColor: viewer.accent, secondaryColor: '#B99CFF', accessories: [], layers: [] };
    const primaryColor = colorPattern.test(String(source.primaryColor || '')) ? String(source.primaryColor).toUpperCase() : current.primaryColor;
    const secondaryColor = colorPattern.test(String(source.secondaryColor || '')) ? String(source.secondaryColor).toUpperCase() : current.secondaryColor;
    const accessories = Array.isArray(source.accessories) ? source.accessories.map((entry) => text(entry, '', 32)).filter(Boolean).slice(0, 4) : current.accessories;
    const layers = Array.isArray(source.layers) ? source.layers.slice(0, 6).map((entry, index) => {
      const layer = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
      const position = ['behind', 'front', 'head'].includes(String(layer.position)) ? String(layer.position) as 'behind' | 'front' | 'head' : 'front';
      return { id: safeId(text(layer.id, `layer-${index + 1}`, 48)), glyph: text(layer.glyph, '✦', 8), color: colorPattern.test(String(layer.color || '')) ? String(layer.color).toUpperCase() : secondaryColor, position };
    }) : current.layers;
    viewer.cosmetics = { paletteId: text(source.paletteId, current.paletteId || '', 48) || undefined, primaryColor, secondaryColor, title: text(source.title, current.title || viewer.title || '', 80) || undefined, accessories, layers };
    viewer.accent = primaryColor;
    viewer.title = viewer.cosmetics.title;
    viewer.accessory = accessories[0];
    viewer.lastSeenAt = new Date().toISOString();
    if (viewer.onStage !== false) { this.stage.dismiss(this.avatarObjectId(viewer.key), 'cosmetics-changed'); this.renderViewer(viewer); }
    await this.touch();
    return clone(viewer);
  }

  async removeActorPackReferences(packId: string): Promise<number> {
    const affected = this.stateValue.viewers.filter((viewer) => viewer.actorPackId === packId);
    for (const viewer of affected) {
      delete viewer.actorPackId;
      viewer.lastSeenAt = new Date().toISOString();
      this.stage.dismiss(this.avatarObjectId(viewer.key), 'actor-pack-removed');
      this.renderViewer(viewer);
    }
    if (affected.length) await this.touch();
    return affected.length;
  }

  async removeViewer(key: string): Promise<boolean> {
    const index = this.stateValue.viewers.findIndex((entry) => entry.key === key);
    if (index < 0) return false;
    this.stateValue.viewers.splice(index, 1);
    this.avatarSessionOverrides.delete(key);
    const timer = this.avatarSessionStateTimers.get(key);
    if (timer) clearTimeout(timer);
    this.avatarSessionStateTimers.delete(key);
    this.stage.dismiss(this.avatarObjectId(key), 'viewer-left');
    await this.touch();
    return true;
  }

  async clearViewers(): Promise<number> {
    const removed = this.stateValue.viewers.length;
    for (const viewer of this.stateValue.viewers) this.stage.dismiss(this.avatarObjectId(viewer.key), 'crowd-cleared');
    this.stateValue.viewers = [];
    for (const timer of this.avatarSessionStateTimers.values()) clearTimeout(timer);
    this.avatarSessionStateTimers.clear();
    this.avatarSessionOverrides.clear();
    if (this.stateValue.battle && ['active', 'waiting'].includes(this.stateValue.battle.state)) {
      this.stateValue.battle.state = 'cancelled';
      this.stateValue.battle.updatedAt = new Date().toISOString();
      this.stage.dismiss('battle:boss', 'crowd-cleared');
      this.stage.dismiss('battle:meter', 'crowd-cleared');
    }
    await this.touch();
    return removed;
  }

  async updatePet(input: unknown): Promise<InteractivePetState> {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const pet = this.stateValue.pet;
    pet.enabled = source.enabled === undefined ? pet.enabled : source.enabled === true;
    pet.name = text(source.name, pet.name, 40);
    pet.accessory = text(source.accessory, pet.accessory || '', 60) || undefined;
    pet.updatedAt = new Date().toISOString();
    if (pet.enabled) this.renderPet(); else this.stage.dismiss('pet:community', 'pet-disabled');
    await this.touch();
    return clone(pet);
  }

  async petAction(actionValue: unknown, actorValue?: unknown): Promise<InteractivePetState> {
    const action = String(actionValue) as PetAction;
    if (!petActions.has(action)) throw new Error(`Pet action must be one of: ${[...petActions].join(', ')}.`);
    const pet = this.stateValue.pet;
    if (action === 'dismiss') {
      pet.enabled = false;
      pet.state = 'dismissed';
      this.stage.dismiss('pet:community', 'pet-dismissed');
    } else {
      pet.enabled = true;
      if (action === 'feed') { pet.hunger = bounded(pet.hunger - 22, 0, 0, 100); pet.mood = bounded(pet.mood + 7, 75, 0, 100); }
      if (action === 'pet') { pet.mood = bounded(pet.mood + 12, 75, 0, 100); pet.affinity += 2; }
      if (action === 'play') { pet.energy = bounded(pet.energy - 14, 70, 0, 100); pet.mood = bounded(pet.mood + 16, 75, 0, 100); pet.affinity += 3; }
      if (action === 'annoy') { pet.mood = bounded(pet.mood - 15, 60, 0, 100); pet.affinity = Math.max(0, pet.affinity - 1); }
      if (action === 'wake') pet.energy = bounded(pet.energy + 5, 70, 0, 100);
      if (action === 'sleep') pet.energy = bounded(pet.energy + 28, 90, 0, 100);
      pet.state = action;
      pet.level = Math.max(1, 1 + Math.floor(pet.affinity / 25));
      this.renderPet(text(actorValue, '', 80));
    }
    pet.updatedAt = new Date().toISOString();
    await this.touch();
    return clone(pet);
  }

  async startBattle(input: unknown): Promise<InteractiveBattleSession> {
    if (!this.stateValue.safety.interactionsEnabled) throw new Error('Interactive World is paused by the safety policy.');
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const mode = ['boss', 'dice', 'reaction'].includes(String(source.mode)) ? String(source.mode) as InteractiveBattleSession['mode'] : 'duel';
    const requestedKeys = Array.isArray(source.viewerKeys) ? source.viewerKeys.map(String) : [];
    const available = (requestedKeys.length ? requestedKeys.map((key) => this.stateValue.viewers.find((viewer) => viewer.key === key)).filter(Boolean) : this.stateValue.viewers.filter((viewer) => viewer.onStage !== false)).slice(0, mode === 'duel' ? 2 : 8) as InteractiveViewerProfile[];
    if (available.length < (mode === 'duel' ? 2 : 1)) throw new Error(mode === 'duel' ? 'A duel needs at least two crowd avatars.' : 'This game needs at least one crowd avatar.');
    const now = new Date().toISOString();
    const participants = available.map((viewer, index): InteractiveBattleParticipant => ({ viewerKey: viewer.key, displayName: viewer.displayName, health: 100, maximumHealth: 100, shield: 0, team: mode === 'duel' ? String(index + 1) : 'viewers', defeated: false }));
    const battle: InteractiveBattleSession = {
      id: globalThis.crypto.randomUUID(), mode, state: source.inviteOnly === true ? 'waiting' : 'active', round: 1, participants: source.inviteOnly === true ? [] : participants,
      invitedViewerKeys: available.map((viewer) => viewer.key), acceptedViewerKeys: source.inviteOnly === true ? [] : available.map((viewer) => viewer.key),
      invitationEndsAt: source.inviteOnly === true ? new Date(Date.now() + bounded(source.invitationMs, 30_000, 5_000, 300_000)).toISOString() : undefined,
      turnEndsAt: source.inviteOnly === true ? undefined : new Date(Date.now() + bounded(source.turnMs, 30_000, 5_000, 300_000)).toISOString(),
      roundLimit: Math.round(bounded(source.roundLimit, mode === 'boss' ? 10 : 5, 1, 50)),
      ...(mode === 'boss' ? { boss: { viewerKey: 'boss:tempest', displayName: text(source.bossName, 'Tempest Titan'), health: 500, maximumHealth: 500, shield: 50, team: 'boss', defeated: false } } : {}),
      startedAt: now, updatedAt: now
    };
    this.stateValue.battle = battle;
    this.renderBattle();
    await this.touch();
    return clone(battle);
  }

  async acceptBattle(viewerKeyValue: unknown): Promise<InteractiveBattleSession> {
    const battle = this.stateValue.battle;
    const key = String(viewerKeyValue || '');
    if (!battle || battle.state !== 'waiting') throw new Error('No battle invitation is open.');
    if (!battle.invitedViewerKeys?.includes(key)) throw new Error('That viewer was not invited to this battle.');
    battle.acceptedViewerKeys ||= [];
    if (!battle.acceptedViewerKeys.includes(key)) battle.acceptedViewerKeys.push(key);
    const viewer = this.requireViewer(key);
    battle.participants.push({ viewerKey: viewer.key, displayName: viewer.displayName, health: 100, maximumHealth: 100, shield: 0, team: battle.mode === 'duel' ? String(battle.participants.length + 1) : 'viewers', defeated: false });
    const minimum = battle.mode === 'duel' ? 2 : 1;
    if (battle.participants.length >= minimum) { battle.state = 'active'; battle.startedAt = new Date().toISOString(); battle.turnEndsAt = new Date(Date.now() + 30_000).toISOString(); }
    battle.updatedAt = new Date().toISOString();
    this.renderBattle(); await this.touch(); return clone(battle);
  }

  async battleAction(input: unknown): Promise<InteractiveBattleSession> {
    const battle = this.stateValue.battle;
    if (!battle || battle.state !== 'active') throw new Error('No battle is active.');
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const action = ['attack', 'heal', 'shield'].includes(String(source.action)) ? String(source.action) : 'attack';
    const attackerKey = text(source.attackerKey, battle.participants[0]?.viewerKey || 'studio:operator', 160);
    const cooldownKey = `${battle.id}:${attackerKey}`;
    const lastAttack = this.attackTimes.get(cooldownKey) || 0;
    if (source.bypassCooldown !== true && Date.now() - lastAttack < this.stateValue.safety.minimumAttackCooldownMs) throw new Error('That participant is still on cooldown.');
    this.attackTimes.set(cooldownKey, Date.now());
    const targets = [...battle.participants, ...(battle.boss ? [battle.boss] : [])];
    const fallbackTarget = battle.boss || battle.participants.find((entry) => entry.viewerKey !== attackerKey) || battle.participants[0];
    const target = targets.find((entry) => entry.viewerKey === String(source.targetKey || '')) || fallbackTarget;
    if (!target) throw new Error('The battle target is unavailable.');
    const defaultAmount = battle.mode === 'dice' && action === 'attack' ? 1 + Math.floor(Math.random() * 20) : action === 'attack' ? 18 : 12;
    const amount = Math.round(bounded(source.amount, defaultAmount, 1, 100));
    if (action === 'attack') {
      const absorbed = Math.min(target.shield, amount);
      target.shield -= absorbed;
      target.health = Math.max(0, target.health - (amount - absorbed));
    } else if (action === 'heal') target.health = Math.min(target.maximumHealth, target.health + amount);
    else target.shield = Math.min(100, target.shield + amount);
    target.defeated = target.health <= 0;
    battle.updatedAt = new Date().toISOString();
    battle.round += 1;
    battle.turnEndsAt = new Date(Date.now() + bounded(source.turnMs, 30_000, 5_000, 300_000)).toISOString();
    const livingParticipants = battle.participants.filter((entry) => !entry.defeated);
    if (battle.mode === 'duel' && livingParticipants.length <= 1) { battle.state = 'complete'; battle.winner = livingParticipants[0]?.displayName || 'Draw'; }
    if (battle.mode === 'boss' && battle.boss?.defeated) { battle.state = 'complete'; battle.winner = 'Viewer Team'; }
    if (battle.mode === 'boss' && !livingParticipants.length) { battle.state = 'complete'; battle.winner = battle.boss?.displayName || 'Boss'; }
    if ((battle.mode === 'dice' || battle.mode === 'reaction') && battle.round > (battle.roundLimit || 5)) { battle.state = 'complete'; battle.winner = [...battle.participants].sort((a, b) => b.health - a.health)[0]?.displayName || 'Draw'; }
    this.renderBattle();
    this.stage.upsert({
      id: `effect:hit:${globalThis.crypto.randomUUID()}`, kind: 'effect', state: action === 'attack' ? 'hit' : action,
      lifetimeMs: this.stateValue.safety.reducedMotion ? 350 : 900,
      placement: this.placementForParticipant(target.viewerKey),
      properties: { glyph: action === 'attack' ? `-${amount}` : action === 'heal' ? `+${amount}` : `SHIELD +${amount}`, label: target.displayName, accent: action === 'attack' ? '#FF667A' : '#70F0B4' }
    });
    await this.touch();
    return clone(battle);
  }

  async viewerAttack(input: unknown) {
    if (!this.stateValue.safety.interactionsEnabled) throw new Error('Interactive World is paused by the safety policy.');
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const viewerName = text(source.viewerName, 'Viewer', 80);
    const viewerId = text(source.viewerId, 'anonymous', 128);
    const platform = ['twitch', 'kick', 'studio'].includes(String(source.platform)) ? String(source.platform) as InteractiveWorldPlatform : 'studio';
    const key = viewerKey(platform, viewerId);
    const previous = this.attackTimes.get(key) || 0;
    if (source.bypassCooldown !== true && Date.now() - previous < this.stateValue.safety.minimumAttackCooldownMs) throw new Error('That viewer attack is still on cooldown.');
    this.attackTimes.set(key, Date.now());
    const x = bounded(source.x, 0.5, 0.03, 0.97);
    const y = bounded(source.y, 0.5, 0.03, 0.97);
    const intensity = bounded(source.intensity, 0.65, 0.1, 1);
    const object = this.stage.upsert({
      id: `effect:viewer-attack:${globalThis.crypto.randomUUID()}`, kind: 'effect', state: 'hit',
      owner: { platform, userId: viewerId, displayName: viewerName },
      lifetimeMs: this.stateValue.safety.reducedMotion ? 350 : 1_000,
      placement: { x, y, scale: 0.65 + intensity * 0.75, anchor: 'center', layer: 75 },
      properties: { glyph: 'HIT', label: `${viewerName} attacked!`, accent: '#FF667A', intensity }
    });
    await this.touch(false);
    return object;
  }

  async endBattle(reason = 'operator'): Promise<InteractiveBattleSession | undefined> {
    const battle = this.stateValue.battle;
    if (!battle) return undefined;
    if (battle.state === 'active' || battle.state === 'waiting') battle.state = reason === 'complete' ? 'complete' : 'cancelled';
    battle.updatedAt = new Date().toISOString();
    this.stage.dismiss('battle:boss', reason);
    this.stage.dismiss('battle:meter', reason);
    for (const participant of battle.participants) {
      const viewer = this.stateValue.viewers.find((entry) => entry.key === participant.viewerKey);
      if (viewer) this.renderViewer(viewer);
    }
    await this.touch();
    return clone(battle);
  }

  async configureGaze(input: unknown): Promise<InteractiveGazeState> {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const gaze = this.stateValue.gaze;
    gaze.enabled = source.enabled === undefined ? gaze.enabled : source.enabled === true;
    gaze.adapter = text(source.adapter, gaze.adapter || 'generic-local', 80);
    if (source.calibration && typeof source.calibration === 'object' && !Array.isArray(source.calibration)) {
      const calibration = source.calibration as Record<string, unknown>;
      gaze.calibration = { offsetX: bounded(calibration.offsetX, gaze.calibration?.offsetX || 0, -1, 1), offsetY: bounded(calibration.offsetY, gaze.calibration?.offsetY || 0, -1, 1), scaleX: bounded(calibration.scaleX, gaze.calibration?.scaleX || 1, 0.25, 4), scaleY: bounded(calibration.scaleY, gaze.calibration?.scaleY || 1, 0.25, 4), calibratedAt: new Date().toISOString() };
    }
    if (['cursor', 'trail', 'heat', 'target'].includes(String(source.effect))) gaze.effect = source.effect as InteractiveGazeState['effect'];
    if (!gaze.enabled) { gaze.connected = false; gaze.confidence = 0; this.stage.dismiss('sensor:gaze', 'gaze-disabled'); }
    gaze.updatedAt = new Date().toISOString();
    await this.touch();
    return clone(gaze);
  }

  async sampleGaze(input: unknown): Promise<InteractiveGazeState> {
    if (!this.stateValue.gaze.enabled) throw new Error('Eye tracking is not enabled.');
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const gaze = this.stateValue.gaze;
    const calibration = gaze.calibration || { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 };
    const mappedX = bounded((Number(source.x) - 0.5) * calibration.scaleX + 0.5 + calibration.offsetX, gaze.x, 0, 1);
    const mappedY = bounded((Number(source.y) - 0.5) * calibration.scaleY + 0.5 + calibration.offsetY, gaze.y, 0, 1);
    const smoothing = 0.32;
    gaze.x = gaze.connected ? gaze.x + (mappedX - gaze.x) * smoothing : mappedX;
    gaze.y = gaze.connected ? gaze.y + (mappedY - gaze.y) * smoothing : mappedY;
    gaze.confidence = bounded(source.confidence, 1, 0, 1);
    gaze.connected = gaze.confidence >= 0.25;
    this.gazeLastSampleMs = Date.now();
    if (this.gazeDisconnectTimer) clearTimeout(this.gazeDisconnectTimer);
    this.gazeDisconnectTimer = setTimeout(() => {
      if (Date.now() - this.gazeLastSampleMs < 2_400) return;
      gaze.connected = false; gaze.confidence = 0; gaze.updatedAt = new Date().toISOString();
      this.stage.dismiss('sensor:gaze', 'gaze-signal-stale');
    }, 2_500);
    this.gazeDisconnectTimer.unref?.();
    gaze.updatedAt = new Date().toISOString();
    if (gaze.connected) this.stage.upsert({
      id: 'sensor:gaze', kind: 'effect', state: gaze.effect, lifetimeMs: 1_500,
      placement: { x: gaze.x, y: gaze.y, scale: gaze.effect === 'heat' ? 1.6 : 0.7, anchor: 'center', layer: 80 },
      properties: { glyph: gaze.effect === 'target' ? '◎' : gaze.effect === 'heat' ? 'HEAT' : '◉', label: 'GAZE', accent: '#B99CFF', confidence: gaze.confidence }
    });
    await this.touch(false);
    return clone(gaze);
  }

  async emergencyStop(): Promise<void> {
    if (this.stateValue.battle && ['active', 'waiting'].includes(this.stateValue.battle.state)) this.stateValue.battle.state = 'cancelled';
    this.stateValue.safety.interactionsEnabled = false;
    this.stateValue.gaze.connected = false;
    this.stateValue.gaze.confidence = 0;
    for (const timer of this.avatarSessionStateTimers.values()) clearTimeout(timer);
    this.avatarSessionStateTimers.clear();
    this.avatarSessionOverrides.clear();
    this.avatarSessionRedemptions = [];
    await this.touch();
  }

  close(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    if (this.gazeDisconnectTimer) clearTimeout(this.gazeDisconnectTimer);
    for (const timer of this.avatarSessionStateTimers.values()) clearTimeout(timer);
    this.avatarSessionStateTimers.clear();
    this.sweepTimer = undefined;
    this.gazeDisconnectTimer = undefined;
  }

  private syncPersistentStage(): void {
    if (!this.stateValue.safety.interactionsEnabled) return;
    for (const viewer of this.stateValue.viewers.filter((entry) => entry.onStage !== false).slice(0, this.stateValue.safety.maximumCrowd)) this.renderViewer(viewer);
    if (this.stateValue.pet.enabled) this.renderPet();
  }

  private renderViewer(viewer: InteractiveViewerProfile, control?: { action: InteractiveViewerControlAction; sequence: number }): void {
    if (viewer.onStage === false) { this.stage.dismiss(this.avatarObjectId(viewer.key), 'viewer-off-stage'); return; }
    const index = Math.max(0, this.stateValue.viewers.findIndex((entry) => entry.key === viewer.key));
    const columns = Math.min(12, Math.max(1, this.stateValue.safety.maximumCrowd));
    const x = columns === 1 ? 0.5 : 0.07 + (index % columns) / (columns - 1) * 0.86;
    const row = Math.floor(index / columns);
    const avatarScale = this.stateValue.presence?.avatarScale || 1;
    const renderState = this.avatarSessionOverrides.get(viewer.key)?.state || viewer.avatarState;
    this.stage.upsert({
      id: this.avatarObjectId(viewer.key), kind: 'avatar', state: renderState,
      ...(viewer.actorPackId ? { assetId: viewer.actorPackId } : {}),
      owner: { platform: viewer.platform, userId: viewer.userId, displayName: viewer.displayName },
      placement: { x, y: 0.9 - row * 0.12, scale: 0.72 * avatarScale, anchor: 'bottom', layer: 20 + row },
      scenePlacements: { vertical: { x: 0.12 + (index % 4) * 0.25, y: 0.91 - Math.floor(index / 4) * 0.1, scale: 0.62 * avatarScale, anchor: 'bottom', layer: 20 + row } },
      properties: this.viewerProperties(viewer, renderState, control)
    });
  }

  private renderPet(actor = ''): void {
    const pet = this.stateValue.pet;
    this.stage.upsert({
      id: 'pet:community', kind: 'pet', state: pet.state,
      owner: { platform: 'studio', userId: 'community-pet', displayName: pet.name },
      placement: { x: 0.84, y: 0.82, scale: 1, anchor: 'bottom', layer: 35 },
      scenePlacements: { vertical: { x: 0.78, y: 0.84, scale: 0.9, anchor: 'bottom', layer: 35 } },
      properties: { glyph: pet.accessory ? '✦' : 'PET', label: actor ? `${pet.name} · ${pet.state} by ${actor}` : pet.name, accent: '#FFB45C', level: pet.level, mood: pet.mood, energy: pet.energy, hunger: pet.hunger, accessory: pet.accessory || '' }
    });
  }

  private renderBattle(): void {
    const battle = this.stateValue.battle;
    if (!battle) return;
    for (const participant of battle.participants) {
      const viewer = this.stateValue.viewers.find((entry) => entry.key === participant.viewerKey);
      if (!viewer) continue;
      this.stage.upsert({
        id: this.avatarObjectId(viewer.key), kind: 'avatar', state: participant.defeated ? 'sleep' : 'battle',
        ...(viewer.actorPackId ? { assetId: viewer.actorPackId } : {}),
        owner: { platform: viewer.platform, userId: viewer.userId, displayName: viewer.displayName },
        placement: this.placementForParticipant(viewer.key),
        properties: { ...this.viewerProperties(viewer, participant.defeated ? 'defeated' : 'battle'), health: participant.health, maxHealth: participant.maximumHealth, shield: participant.shield, team: participant.team }
      });
    }
    if (battle.boss) this.stage.upsert({
      id: 'battle:boss', kind: 'game-object', state: battle.boss.defeated ? 'defeated' : 'boss',
      placement: { x: 0.5, y: 0.28, scale: 1.35, anchor: 'center', layer: 30 },
      properties: { glyph: 'BOSS', label: battle.boss.displayName, accent: '#FF667A', health: battle.boss.health, maxHealth: battle.boss.maximumHealth, shield: battle.boss.shield }
    });
    this.stage.upsert({
      id: 'battle:meter', kind: 'meter', state: battle.state,
      placement: { x: 0.5, y: 0.07, scale: 1, anchor: 'top', layer: 70 },
      properties: { glyph: battle.mode.toUpperCase(), label: battle.state === 'complete' ? `Winner: ${battle.winner || 'Draw'}` : `Round ${battle.round}`, accent: battle.mode === 'boss' ? '#FF667A' : '#54F2EB', health: battle.boss?.health ?? battle.participants.reduce((total, entry) => total + entry.health, 0), maxHealth: battle.boss?.maximumHealth ?? battle.participants.reduce((total, entry) => total + entry.maximumHealth, 0) }
    });
  }

  private placementForParticipant(key: string) {
    const battle = this.stateValue.battle;
    const index = Math.max(0, battle?.participants.findIndex((entry) => entry.viewerKey === key) ?? 0);
    const count = Math.max(1, battle?.participants.length || 1);
    return { x: count === 1 ? 0.22 : 0.14 + index / (count - 1) * 0.72, y: 0.8, scale: 0.88 * (this.stateValue.presence?.avatarScale || 1), anchor: 'bottom' as const, layer: 40 };
  }

  private viewerProperties(viewer: InteractiveViewerProfile, state: string, control?: { action: InteractiveViewerControlAction; sequence: number }): Record<string, string | number | boolean> {
    const actor = this.actors.resolveAnimation(viewer.actorPackId, state);
    const actorMotionStates = actor ? [...new Set(['idle', 'walk', 'jump', 'attack', 'celebrate', 'emote', 'sit', 'stand', 'sleep', 'damaged', 'defeated', 'battle', ...Object.keys(actor.pack.animations)])] : [];
    const actorMotionClips = actor ? Object.fromEntries(actorMotionStates.map((motion) => {
      const resolved = this.actors.resolveAnimation(viewer.actorPackId, motion);
      return [motion, resolved ? {
        state: resolved.state,
        asset: resolved.assetUrl,
        primaryMask: resolved.primaryMaskUrl || '',
        secondaryMask: resolved.secondaryMaskUrl || '',
        frameWidth: resolved.animation.frameWidth,
        frameHeight: resolved.animation.frameHeight,
        frames: resolved.animation.frames,
        atlasColumns: resolved.pack.atlas?.columns || resolved.animation.frames,
        atlasRows: resolved.pack.atlas?.rows || 1,
        atlasRow: resolved.animation.row || 0,
        atlasStartFrame: resolved.animation.startFrame || 0,
        fps: resolved.animation.fps,
        loop: resolved.animation.loop
      } : null];
    })) : undefined;
    const persistentCosmetics = viewer.cosmetics || { primaryColor: viewer.accent, secondaryColor: '#B99CFF', accessories: viewer.accessory ? [viewer.accessory] : [], layers: [] };
    const session = this.avatarSessionOverrides.get(viewer.key);
    const cosmetics = { ...persistentCosmetics, ...(session || {}), accessories: session?.accessories || persistentCosmetics.accessories };
    return {
      glyph: viewer.displayName.slice(0, 1).toUpperCase(), label: viewer.displayName, accent: cosmetics.primaryColor,
      accessory: cosmetics.accessories.join(' · '), title: cosmetics.title || viewer.title || '', secondaryAccent: cosmetics.secondaryColor,
      cosmeticLayers: JSON.stringify(cosmetics.layers), presence: viewer.presence || 'active',
      ...(actor ? {
        actorPackId: actor.pack.id,
        actorAsset: actor.assetUrl,
        actorPrimaryMask: actor.primaryMaskUrl || '',
        actorSecondaryMask: actor.secondaryMaskUrl || '',
        actorPrimaryColor: cosmetics.primaryColor,
        actorSecondaryColor: cosmetics.secondaryColor,
        actorState: actor.state,
        actorFrameWidth: actor.animation.frameWidth,
        actorFrameHeight: actor.animation.frameHeight,
        actorFrames: actor.animation.frames,
        actorAtlasColumns: actor.pack.atlas?.columns || actor.animation.frames,
        actorAtlasRows: actor.pack.atlas?.rows || 1,
        actorAtlasRow: actor.animation.row || 0,
        actorAtlasStartFrame: actor.animation.startFrame || 0,
        actorFps: actor.animation.fps,
        actorLoop: actor.animation.loop,
        actorScale: actor.pack.defaultScale,
        actorPivotX: actor.pack.pivot.x,
        actorPivotY: actor.pack.pivot.y,
        actorColliderX: actor.pack.collider.x,
        actorColliderY: actor.pack.collider.y,
        actorColliderWidth: actor.pack.collider.width,
        actorColliderHeight: actor.pack.collider.height,
        actorMotionClips: JSON.stringify(actorMotionClips),
        ...(actor.pack.preferredRenderer === 'rig' && actor.pack.rig ? { actorRigUrl: `/interactive-stage/actors/${encodeURIComponent(actor.pack.id)}/rig.json` } : {})
      } : {}),
      ...(control ? { worldControlAction: control.action, worldControlSequence: control.sequence } : {})
    };
  }

  private avatarObjectId(key: string): string { return `avatar:${safeId(key)}`; }
  private sweepBattle(now: number): void {
    const battle = this.stateValue.battle;
    if (!battle) return;
    if (battle.state === 'waiting' && battle.invitationEndsAt && Date.parse(battle.invitationEndsAt) <= now) {
      battle.state = battle.participants.length ? 'active' : 'cancelled'; battle.updatedAt = new Date(now).toISOString();
    } else if (battle.state === 'active' && battle.turnEndsAt && Date.parse(battle.turnEndsAt) <= now) {
      battle.round += 1; battle.turnEndsAt = new Date(now + 30_000).toISOString(); battle.updatedAt = new Date(now).toISOString();
      if (battle.round > (battle.roundLimit || 5)) { battle.state = 'complete'; battle.winner = [...battle.participants].sort((a, b) => b.health - a.health)[0]?.displayName || 'Draw'; }
      this.renderBattle();
    }
  }
  private requireViewer(key: string): InteractiveViewerProfile {
    const viewer = this.stateValue.viewers.find((entry) => entry.key === key);
    if (!viewer) throw new Error(`Viewer ${key} was not found.`);
    return viewer;
  }
  private async touch(persist = true): Promise<void> {
    this.stateValue.revision += 1;
    this.stateValue.updatedAt = new Date().toISOString();
    if (persist) await this.persist();
  }
  private async persist(): Promise<void> {
    const temporary = `${this.filePath}.tmp`;
    const durableState = { ...this.stateValue, gaze: { ...this.stateValue.gaze, connected: false, x: 0.5, y: 0.5, confidence: 0 } };
    await writeFile(temporary, `${JSON.stringify(durableState, null, 2)}\n`, 'utf8');
    await rename(temporary, this.filePath);
  }
}
