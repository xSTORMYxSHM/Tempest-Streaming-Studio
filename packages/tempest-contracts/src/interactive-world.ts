export const INTERACTIVE_WORLD_SCHEMA_VERSION = 1 as const;

export type InteractiveWorldPlatform = 'twitch' | 'kick' | 'studio';
export type ViewerAvatarState = 'idle' | 'walk' | 'jump' | 'sit' | 'sleep' | 'celebrate' | 'emote';
export type InteractiveViewerControlAction = 'left' | 'right' | 'jump' | 'drop' | 'interact' | 'emote' | 'unstuck';
export type ViewerPresenceState = 'observed' | 'active' | 'inactive';
export type PetAction = 'feed' | 'pet' | 'play' | 'annoy' | 'wake' | 'sleep' | 'dress' | 'call' | 'dismiss';
export type BattleMode = 'duel' | 'boss' | 'dice' | 'reaction';
export type BattleState = 'waiting' | 'active' | 'complete' | 'cancelled';
export type AvatarChannelPointEffect = 'primary-color' | 'secondary-color' | 'accessory' | 'title' | 'emote' | 'celebrate';
export type AvatarChannelPointPersistence = 'session' | 'profile';

export interface AvatarChannelPointRedeem {
  id: string;
  name: string;
  rewardId?: string;
  rewardTitle?: string;
  effect: AvatarChannelPointEffect;
  value?: string;
  persistence: AvatarChannelPointPersistence;
  enabled: boolean;
}

export interface AvatarSessionRedemption {
  id: string;
  redeemId: string;
  rewardId?: string;
  rewardTitle?: string;
  viewerKey: string;
  viewerName: string;
  effect: AvatarChannelPointEffect;
  value?: string;
  persistence: AvatarChannelPointPersistence;
  appliedAt: string;
}

export interface InteractivePresencePolicy {
  enabled: boolean;
  avatarScale: number;
  minimumMessages: number;
  messageWindowMs: number;
  inactiveAfterMs: number;
  removeFromStageAfterMs: number;
}

export interface InteractiveViewerCosmetics {
  paletteId?: string;
  primaryColor: string;
  secondaryColor: string;
  title?: string;
  accessories: string[];
  layers: Array<{ id: string; glyph: string; color: string; position: 'behind' | 'front' | 'head' }>;
}

export interface InteractiveWorldSafetyPolicy {
  interactionsEnabled: boolean;
  maximumCrowd: number;
  maximumStageObjects: number;
  maximumConcurrentEffects: number;
  minimumAttackCooldownMs: number;
  minimumJumpscareCooldownMs: number;
  allowJumpscares: boolean;
  reducedMotion: boolean;
  reducedFlashing: boolean;
  volumeCeiling: number;
}

export interface InteractiveViewerProfile {
  key: string;
  platform: InteractiveWorldPlatform;
  userId: string;
  displayName: string;
  accent: string;
  avatarState: ViewerAvatarState;
  actorPackId?: string;
  accessory?: string;
  title?: string;
  presence?: ViewerPresenceState;
  onStage?: boolean;
  messageCount?: number;
  inactiveAt?: string;
  cosmetics?: InteractiveViewerCosmetics;
  unlockedAvatarRedeemIds?: string[];
  joinedAt: string;
  lastSeenAt: string;
}

export interface InteractivePetState {
  enabled: boolean;
  name: string;
  mood: number;
  energy: number;
  hunger: number;
  level: number;
  affinity: number;
  state: string;
  accessory?: string;
  updatedAt: string;
}

export interface InteractiveBattleParticipant {
  viewerKey: string;
  displayName: string;
  health: number;
  maximumHealth: number;
  shield: number;
  team: string;
  defeated: boolean;
}

export interface InteractiveBattleSession {
  id: string;
  mode: BattleMode;
  state: BattleState;
  round: number;
  participants: InteractiveBattleParticipant[];
  boss?: InteractiveBattleParticipant;
  winner?: string;
  invitedViewerKeys?: string[];
  acceptedViewerKeys?: string[];
  invitationEndsAt?: string;
  turnEndsAt?: string;
  roundLimit?: number;
  startedAt: string;
  updatedAt: string;
}

export interface InteractiveGazeState {
  enabled: boolean;
  connected: boolean;
  adapter: string;
  x: number;
  y: number;
  confidence: number;
  effect: 'cursor' | 'trail' | 'heat' | 'target';
  calibration?: {
    offsetX: number;
    offsetY: number;
    scaleX: number;
    scaleY: number;
    calibratedAt?: string;
  };
  diagnostics?: string;
  updatedAt: string;
}

export interface InteractiveWorldState {
  schemaVersion: typeof INTERACTIVE_WORLD_SCHEMA_VERSION;
  revision: number;
  updatedAt: string;
  safety: InteractiveWorldSafetyPolicy;
  presence?: InteractivePresencePolicy;
  avatarChannelPointRedeems?: AvatarChannelPointRedeem[];
  viewers: InteractiveViewerProfile[];
  pet: InteractivePetState;
  battle?: InteractiveBattleSession;
  gaze: InteractiveGazeState;
}
