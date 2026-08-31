export const TEMPEST_PROTOCOL_VERSION = '1.0';
export const TEMPEST_STUDIO_VERSION = '1.0.1';
export const TEMPEST_MANIFEST_SCHEMA_VERSION = 1;
export const TEMPEST_ASSET_SCHEMA_VERSION = 1;

export const applicationStates = ['development', 'installed', 'disabled'] as const;
export const healthModes = ['none', 'process', 'http'] as const;
export const messageKinds = ['hello', 'welcome', 'subscribe', 'unsubscribe', 'publish', 'event', 'command', 'response', 'heartbeat', 'error'] as const;
export const workflowTriggerTypes = ['viewer.interaction', 'twitch.chat', 'twitch.channel-points', 'twitch.cheer', 'system.event', 'operator.manual'] as const;
export const workflowRunStates = ['pending', 'running', 'completed', 'partial', 'stopped', 'failed'] as const;
export const workflowActionStates = ['scheduled', 'active', 'completed', 'released', 'unavailable', 'failed', 'cancelled'] as const;
export const normalizedTwitchEventTopics = [
  'viewer.interaction.requested',
  'viewer.chat.message',
  'viewer.reward.redeemed',
  'viewer.followed',
  'viewer.subscription.started',
  'viewer.cheer.received',
  'viewer.raid.received',
  'channel.stream.online',
  'channel.stream.offline',
  'channel.moderation.action',
  'channel.poll.updated',
  'channel.prediction.updated',
  'channel.hype-train.updated',
  'channel.goal.updated'
] as const;

export type ApplicationState = typeof applicationStates[number];
export type HealthMode = typeof healthModes[number];
export type MessageKind = typeof messageKinds[number];
export type WorkflowTriggerType = typeof workflowTriggerTypes[number];
export type WorkflowRunState = typeof workflowRunStates[number];
export type WorkflowActionState = typeof workflowActionStates[number];
export type NormalizedTwitchEventTopic = typeof normalizedTwitchEventTopics[number];

export interface TempestCapabilitySet {
  provides: string[];
  consumes: string[];
}

export interface TempestAssetTypeSet {
  reads: string[];
  writes: string[];
}

export interface TempestLaunchDescriptor {
  executable: string;
  args?: string[];
  workingDirectory?: string;
}

export interface TempestHealthDescriptor {
  mode: HealthMode;
  url?: string;
}

export interface TempestApplicationManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  apiVersion: string;
  description?: string;
  state: ApplicationState;
  capabilities: TempestCapabilitySet;
  assetTypes: TempestAssetTypeSet;
  launch?: TempestLaunchDescriptor;
  health?: TempestHealthDescriptor;
  icon?: string;
  manifestPath?: string;
  registeredAt?: string;
  updatedAt?: string;
}

export interface TempestAssetManifest {
  schemaVersion: 1;
  id: string;
  type: string;
  name: string;
  version: string;
  producer: string;
  uri: string;
  checksum?: string;
  tags?: string[];
  dependencies?: string[];
  preview?: string;
  metadata?: Record<string, unknown>;
  registeredAt?: string;
  updatedAt?: string;
}

export interface TempestWorkflowTrigger {
  type: WorkflowTriggerType;
  action: string;
}

export interface TempestWorkflowCooldowns {
  viewerMs?: number;
  effectMs?: number;
  globalMs?: number;
}

export interface TempestWorkflowLease {
  durationMs: number;
  durationInput?: string;
  fadeInMs?: number;
  fadeOutMs?: number;
}

export interface TempestWorkflowAction {
  id: string;
  name: string;
  target: string;
  capability: string;
  releaseCapability?: string;
  arguments?: Record<string, unknown>;
  forwardInteractionPayload?: boolean;
  whenPayload?: { field: string; equals: string | number | boolean; ifMissing?: boolean };
  delayMs?: number;
  lease?: TempestWorkflowLease;
}

export interface TempestWorkflowDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: TempestWorkflowTrigger;
  cooldowns?: TempestWorkflowCooldowns;
  concurrencyGroup?: string;
  maximumConcurrent?: number;
  actions: TempestWorkflowAction[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TempestInteractionRequest {
  source: string;
  eventId?: string;
  viewerId?: string;
  viewerName?: string;
  payload?: Record<string, unknown>;
  simulateMissing?: boolean;
  bypassCooldown?: boolean;
}

export interface TempestSoundAlertDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  free: true;
  warudoEnabled: boolean;
  vtubeStudioEnabled: boolean;
  vtubeStudioHotkey?: string;
  cue: string;
  durationMs: number;
  viewerCooldownMs: number;
  globalCooldownMs: number;
  volume: number;
  audioUri?: string;
  visualUri?: string;
  visualDurationMs: number;
  broadcastAudioSource?: string;
  broadcastVisualSource?: string;
  broadcastEffect?: 'pulse' | 'glow' | 'glitch' | 'spectrum' | 'surge';
  broadcastCircuit?: 'all' | 'core' | 'frame' | 'chat' | 'plates' | 'alerts';
  broadcastEffectStrength?: number;
  legacyReceiver?: string;
  accent?: string;
  design: TempestTwitchAlertDesign;
  updatedAt?: string;
  custom?: boolean;
}

export interface TempestSoundAlertTriggerRequest {
  source: 'studio.operator' | 'twitch.extension' | 'twitch.channel-points' | 'api';
  eventId?: string;
  viewerId?: string;
  viewerName?: string;
  intensity?: number;
  simulateMissing?: boolean;
  bypassCooldown?: boolean;
}

export interface TempestSoundAlertPlaybackCommand {
  phase: 'play' | 'stop-all';
  runId?: string;
  alert?: TempestSoundAlertDefinition;
}

export interface TempestTwitchVisualAlertDefinition {
  schemaVersion: 1;
  id: string;
  topic: NormalizedTwitchEventTopic;
  variant?: 'standard' | 'gift';
  name: string;
  enabled: boolean;
  durationMs: number;
  audioUri?: string;
  volume: number;
  visualUri?: string;
  accent: string;
  design: TempestTwitchAlertDesign;
  alertVariants?: TempestTwitchAlertVariant[];
  selectedVariantId?: string;
  selectedVariantName?: string;
  updatedAt?: string;
  custom?: boolean;
}

export interface TempestTwitchAlertVariantCondition {
  minimumBits?: number;
  maximumBits?: number;
  minimumViewers?: number;
  maximumViewers?: number;
  minimumMonths?: number;
  maximumMonths?: number;
  subscriptionTier?: 'prime' | '1000' | '2000' | '3000';
  rewardId?: string;
  minimumRewardCost?: number;
  maximumRewardCost?: number;
}

export interface TempestTwitchAlertVariant {
  schemaVersion: 1;
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  condition: TempestTwitchAlertVariantCondition;
  durationMs: number;
  audioUri?: string;
  volume: number;
  visualUri?: string;
  accent: string;
  design: TempestTwitchAlertDesign;
}

export interface TempestTwitchAlertDesign {
  preset: 'tempest' | 'minimal' | 'compact' | 'glass' | 'neon' | 'cinematic';
  layout: 'media-left' | 'media-right' | 'media-top' | 'media-overlay' | 'text-only' | 'media-only';
  position: 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'custom';
  positionOffsetX: number;
  positionOffsetY: number;
  customPositionX: number;
  customPositionY: number;
  scale: number;
  entranceAnimation: 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'zoom' | 'bounce' | 'flip' | 'glitch';
  exitAnimation: 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'zoom';
  textAnimation: 'none' | 'pulse' | 'wiggle' | 'glow' | 'typewriter';
  headlineTemplate: string;
  detailTemplate: string;
  showEyebrow: boolean;
  showHeadline: boolean;
  showDetail: boolean;
  showViewerMessage: boolean;
  fontFamily: 'Inter' | 'Segoe UI' | 'Consolas' | 'Arial' | 'Georgia' | 'Impact' | 'Trebuchet MS' | 'Times New Roman';
  fontSize: number;
  eyebrowFontSize: number;
  detailFontSize: number;
  messageFontSize: number;
  fontWeight: number;
  textAlign: 'left' | 'center' | 'right';
  textColor: string;
  secondaryTextColor: string;
  eyebrowTextColor: string;
  messageTextColor: string;
  textShadow: number;
  letterSpacing: number;
  textOffsetX: number;
  textOffsetY: number;
  textPositionX: number;
  textPositionY: number;
  eyebrowPositionX: number;
  eyebrowPositionY: number;
  headlinePositionX: number;
  headlinePositionY: number;
  detailPositionX: number;
  detailPositionY: number;
  messagePositionX: number;
  messagePositionY: number;
  eyebrowMaxWidth: number;
  headlineMaxWidth: number;
  detailMaxWidth: number;
  messageMaxWidth: number;
  cardWidth: number;
  backgroundColor: string;
  backgroundOpacity: number;
  borderWidth: number;
  borderRadius: number;
  padding: number;
  cardShadow: number;
  mediaWidth: number;
  mediaHeight: number;
  mediaFit: 'contain' | 'cover' | 'fill';
  mediaScale: number;
  mediaPositionX: number;
  mediaPositionY: number;
  mediaOpacity: number;
  mediaBorderRadius: number;
  mediaDelayMs: number;
  textDelayMs: number;
  textDurationMs: number;
  soundDelayMs: number;
  ttsEnabled: boolean;
  ttsTemplate: string;
  ttsVolume: number;
  ttsRate: number;
  ttsPitch: number;
  customHtml: string;
  customCss: string;
  customJavaScript: string;
}

export interface TempestTwitchChannelIdentity {
  id: string;
  login?: string;
  displayName?: string;
}

export interface TempestTwitchViewerIdentity {
  id: string;
  login?: string;
  displayName?: string;
  roles?: string[];
}

export interface TempestTwitchInteractionPayload extends Record<string, unknown> {
  action: string;
  input?: string;
}

export interface TempestTwitchChatPayload extends Record<string, unknown> {
  messageId: string;
  text: string;
}

export interface TempestTwitchRewardPayload extends Record<string, unknown> {
  redemptionId: string;
  rewardId: string;
  rewardTitle: string;
  rewardCost?: number;
  input?: string;
  action?: string;
}

export interface TempestTwitchSubscriptionPayload extends Record<string, unknown> {
  tier: string;
  isGift: boolean;
  cumulativeMonths?: number;
}

export interface TempestTwitchCheerPayload extends Record<string, unknown> {
  bits: number;
  message?: string;
}

export interface TempestTwitchRaidPayload extends Record<string, unknown> {
  fromBroadcasterId: string;
  fromBroadcasterName: string;
  viewers: number;
}

export interface TempestNormalizedTwitchEvent {
  schemaVersion: 1;
  id: string;
  topic: NormalizedTwitchEventTopic;
  occurredAt: string;
  source: 'twitch';
  channel: TempestTwitchChannelIdentity;
  viewer?: TempestTwitchViewerIdentity;
  payload: Record<string, unknown>;
}

export interface TempestWorkflowActionRun {
  id: string;
  name: string;
  target: string;
  capability: string;
  releaseCapability?: string;
  state: WorkflowActionState;
  delivery?: 'connected' | 'simulated' | 'unavailable';
  activatedAt?: string;
  releasedAt?: string;
  error?: string;
}

export interface TempestWorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  state: WorkflowRunState;
  source: string;
  triggerEventId?: string;
  viewerId?: string;
  viewerName?: string;
  startedAt: string;
  endsAt?: string;
  completedAt?: string;
  actions: TempestWorkflowActionRun[];
}

export interface TempestEventRecord {
  id: string;
  timestamp: string;
  type: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  runId?: string;
  workflowId?: string;
  target?: string;
  data?: Record<string, unknown>;
}

export interface TempestBridgeMessage<T = unknown> {
  protocolVersion: string;
  id: string;
  kind: MessageKind;
  source: string;
  target?: string;
  topic?: string;
  timestamp: string;
  correlationId?: string;
  payload?: T;
}

export interface TempestBridgeHealth {
  service: 'tempest-bridge';
  productVersion: string;
  status: 'online';
  protocolVersion: string;
  startedAt: string;
  applications: number;
  assets: number;
  connections: number;
  workflows: number;
  activeRuns: number;
  safetyArmed: boolean;
}

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

const identifierPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;
const versionPattern = /^\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.trim().length > 0);
}

function requiredString(source: Record<string, unknown>, key: string, errors: string[]): string {
  const value = source[key];
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${key} must be a non-empty string.`);
    return '';
  }
  return value.trim();
}

export function validateApplicationManifest(input: unknown): ValidationResult<TempestApplicationManifest> {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ['Application manifest must be an object.'] };
  const source = input;
  if (source.schemaVersion !== TEMPEST_MANIFEST_SCHEMA_VERSION) errors.push(`schemaVersion must be ${TEMPEST_MANIFEST_SCHEMA_VERSION}.`);
  const id = requiredString(source, 'id', errors);
  const name = requiredString(source, 'name', errors);
  const version = requiredString(source, 'version', errors);
  const apiVersion = requiredString(source, 'apiVersion', errors);
  if (id && !identifierPattern.test(id)) errors.push('id must be a namespaced lowercase identifier.');
  if (version && !versionPattern.test(version)) errors.push('version must use a semantic numeric version.');
  if (apiVersion && !/^\d+\.\d+$/.test(apiVersion)) errors.push('apiVersion must use major.minor format.');
  if (!applicationStates.includes(source.state as ApplicationState)) errors.push(`state must be one of: ${applicationStates.join(', ')}.`);

  const capabilities = source.capabilities;
  if (!isObject(capabilities) || !isStringArray(capabilities.provides) || !isStringArray(capabilities.consumes)) {
    errors.push('capabilities must contain provides and consumes string arrays.');
  }
  const assetTypes = source.assetTypes;
  if (!isObject(assetTypes) || !isStringArray(assetTypes.reads) || !isStringArray(assetTypes.writes)) {
    errors.push('assetTypes must contain reads and writes string arrays.');
  }

  if (source.launch !== undefined) {
    if (!isObject(source.launch) || typeof source.launch.executable !== 'string' || !source.launch.executable.trim()) {
      errors.push('launch.executable must be a non-empty string.');
    } else if (source.launch.args !== undefined && !isStringArray(source.launch.args)) {
      errors.push('launch.args must be an array of strings.');
    }
  }
  if (source.health !== undefined) {
    if (!isObject(source.health) || !healthModes.includes(source.health.mode as HealthMode)) {
      errors.push(`health.mode must be one of: ${healthModes.join(', ')}.`);
    }
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors,
    value: {
      ...source,
      schemaVersion: 1,
      id,
      name,
      version,
      apiVersion,
      state: source.state as ApplicationState,
      capabilities: capabilities as unknown as TempestCapabilitySet,
      assetTypes: assetTypes as unknown as TempestAssetTypeSet
    } as TempestApplicationManifest
  };
}

export function validateAssetManifest(input: unknown): ValidationResult<TempestAssetManifest> {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ['Asset manifest must be an object.'] };
  const source = input;
  if (source.schemaVersion !== TEMPEST_ASSET_SCHEMA_VERSION) errors.push(`schemaVersion must be ${TEMPEST_ASSET_SCHEMA_VERSION}.`);
  const id = requiredString(source, 'id', errors);
  const type = requiredString(source, 'type', errors);
  const name = requiredString(source, 'name', errors);
  const version = requiredString(source, 'version', errors);
  const producer = requiredString(source, 'producer', errors);
  const uri = requiredString(source, 'uri', errors);
  if (id && !identifierPattern.test(id)) errors.push('id must be a namespaced lowercase identifier.');
  if (type && !identifierPattern.test(type)) errors.push('type must be a namespaced lowercase identifier.');
  if (version && !versionPattern.test(version)) errors.push('version must use a semantic numeric version.');
  if (source.tags !== undefined && !isStringArray(source.tags)) errors.push('tags must be an array of strings.');
  if (source.dependencies !== undefined && !isStringArray(source.dependencies)) errors.push('dependencies must be an array of asset IDs.');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors,
    value: {
      ...source,
      schemaVersion: 1,
      id,
      type,
      name,
      version,
      producer,
      uri
    } as TempestAssetManifest
  };
}

function optionalDuration(value: unknown, key: string, errors: string[], maximum = 24 * 60 * 60 * 1000): number | undefined {
  if (value === undefined) return undefined;
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 0 || duration > maximum) {
    errors.push(`${key} must be a duration between 0 and ${maximum} milliseconds.`);
    return undefined;
  }
  return Math.round(duration);
}

export function validateNormalizedTwitchEvent(input: unknown): ValidationResult<TempestNormalizedTwitchEvent> {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ['Normalized Twitch event must be an object.'] };
  const source = input;
  if (source.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  const id = requiredString(source, 'id', errors);
  if (source.source !== 'twitch') errors.push('source must be twitch.');
  if (!normalizedTwitchEventTopics.includes(source.topic as NormalizedTwitchEventTopic)) {
    errors.push(`topic must be one of: ${normalizedTwitchEventTopics.join(', ')}.`);
  }
  const occurredAt = requiredString(source, 'occurredAt', errors);
  if (occurredAt && Number.isNaN(Date.parse(occurredAt))) errors.push('occurredAt must be an ISO-8601 timestamp.');

  if (!isObject(source.channel)) errors.push('channel must be an object.');
  else requiredString(source.channel, 'id', errors);

  if (source.viewer !== undefined) {
    if (!isObject(source.viewer)) errors.push('viewer must be an object.');
    else {
      requiredString(source.viewer, 'id', errors);
      if (source.viewer.roles !== undefined && (!Array.isArray(source.viewer.roles) || source.viewer.roles.some((role) => typeof role !== 'string'))) {
        errors.push('viewer.roles must be an array of strings.');
      }
    }
  }

  if (!isObject(source.payload)) errors.push('payload must be an object.');
  else {
    const payload = source.payload;
    if (source.topic === 'viewer.interaction.requested') {
      const action = requiredString(payload, 'action', errors);
      if (action && !identifierPattern.test(action)) errors.push('payload.action must be a namespaced lowercase identifier.');
    } else if (source.topic === 'viewer.chat.message') {
      requiredString(payload, 'messageId', errors);
      requiredString(payload, 'text', errors);
      if (payload.fragments !== undefined) {
        if (!Array.isArray(payload.fragments)) errors.push('payload.fragments must be an array when supplied.');
        else for (const [index, entry] of payload.fragments.entries()) {
          if (!isObject(entry)) { errors.push(`payload.fragments[${index}] must be an object.`); continue; }
          if (!['text', 'emote', 'gif'].includes(String(entry.type || ''))) errors.push(`payload.fragments[${index}].type must be text, emote, or gif.`);
          if (typeof entry.text !== 'string') errors.push(`payload.fragments[${index}].text must be a string.`);
          if (entry.type === 'emote') {
            if (!isObject(entry.emote)) errors.push(`payload.fragments[${index}].emote must be an object.`);
            else {
              if (typeof entry.emote.id !== 'string' || !/^[A-Za-z0-9_]+$/.test(entry.emote.id)) errors.push(`payload.fragments[${index}].emote.id is invalid.`);
              if (!Array.isArray(entry.emote.format) || entry.emote.format.some((format) => !['static', 'animated'].includes(String(format)))) errors.push(`payload.fragments[${index}].emote.format must contain only static or animated.`);
            }
          }
          if (entry.type === 'gif') {
            if (!isObject(entry.gif) || typeof entry.gif.url !== 'string') errors.push(`payload.fragments[${index}].gif.url must be an HTTPS URL.`);
            else {
              try { if (new URL(entry.gif.url).protocol !== 'https:') errors.push(`payload.fragments[${index}].gif.url must be an HTTPS URL.`); }
              catch { errors.push(`payload.fragments[${index}].gif.url must be an HTTPS URL.`); }
            }
          }
        }
      }
    } else if (source.topic === 'viewer.reward.redeemed') {
      requiredString(payload, 'redemptionId', errors);
      requiredString(payload, 'rewardId', errors);
      requiredString(payload, 'rewardTitle', errors);
      if (payload.action !== undefined && (typeof payload.action !== 'string' || !identifierPattern.test(payload.action))) errors.push('payload.action must be a namespaced lowercase identifier when supplied.');
    } else if (source.topic === 'viewer.subscription.started') {
      requiredString(payload, 'tier', errors);
      if (typeof payload.isGift !== 'boolean') errors.push('payload.isGift must be a boolean.');
    } else if (source.topic === 'viewer.cheer.received') {
      if (!Number.isInteger(payload.bits) || Number(payload.bits) < 1) errors.push('payload.bits must be a positive integer.');
      if (payload.action !== undefined && (typeof payload.action !== 'string' || !identifierPattern.test(payload.action))) errors.push('payload.action must be a namespaced lowercase identifier when supplied.');
    } else if (source.topic === 'viewer.raid.received') {
      requiredString(payload, 'fromBroadcasterId', errors);
      requiredString(payload, 'fromBroadcasterName', errors);
      if (!Number.isInteger(payload.viewers) || Number(payload.viewers) < 0) errors.push('payload.viewers must be a non-negative integer.');
    }
    if (payload.action === 'tempest.sound-alert.performance') {
      requiredString(payload, 'cue', errors);
      if (!Number.isInteger(payload.durationMs) || Number(payload.durationMs) < 1000 || Number(payload.durationMs) > 60000) errors.push('payload.durationMs must be an integer between 1000 and 60000 milliseconds.');
      if (payload.intensity !== undefined && (typeof payload.intensity !== 'number' || payload.intensity < 0 || payload.intensity > 1)) errors.push('payload.intensity must be between 0 and 1.');
      if (payload.strength !== undefined && (typeof payload.strength !== 'number' || payload.strength < 0 || payload.strength > 1)) errors.push('payload.strength must be between 0 and 1.');
      for (const field of ['eventType', 'name', 'circuit', 'accent', 'effect', 'dedupeId', 'broadcastAudioSource', 'broadcastVisualSource']) {
        if (payload[field] !== undefined && typeof payload[field] !== 'string') errors.push(`payload.${field} must be a string when supplied.`);
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors, value: { ...source, schemaVersion: 1, id, occurredAt } as unknown as TempestNormalizedTwitchEvent };
}

export function validateWorkflowDefinition(input: unknown): ValidationResult<TempestWorkflowDefinition> {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ['Workflow definition must be an object.'] };
  const source = input;
  if (source.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  const id = requiredString(source, 'id', errors);
  const name = requiredString(source, 'name', errors);
  if (id && !identifierPattern.test(id)) errors.push('id must be a namespaced lowercase identifier.');
  if (typeof source.enabled !== 'boolean') errors.push('enabled must be a boolean.');

  const trigger = source.trigger;
  if (!isObject(trigger)) errors.push('trigger must be an object.');
  else {
    if (!workflowTriggerTypes.includes(trigger.type as WorkflowTriggerType)) errors.push(`trigger.type must be one of: ${workflowTriggerTypes.join(', ')}.`);
    const action = requiredString(trigger, 'action', errors);
    if (action && !identifierPattern.test(action)) errors.push('trigger.action must be a namespaced lowercase identifier.');
  }

  const cooldowns = source.cooldowns;
  if (cooldowns !== undefined && !isObject(cooldowns)) errors.push('cooldowns must be an object.');
  else if (isObject(cooldowns)) {
    optionalDuration(cooldowns.viewerMs, 'cooldowns.viewerMs', errors);
    optionalDuration(cooldowns.effectMs, 'cooldowns.effectMs', errors);
    optionalDuration(cooldowns.globalMs, 'cooldowns.globalMs', errors);
  }

  const actions = source.actions;
  if (!Array.isArray(actions) || !actions.length) errors.push('actions must contain at least one workflow action.');
  else if (actions.length > 64) errors.push('actions cannot contain more than 64 entries.');
  else {
    const actionIds = new Set<string>();
    actions.forEach((action, index) => {
      if (!isObject(action)) return errors.push(`actions[${index}] must be an object.`);
      const actionId = requiredString(action, 'id', errors);
      requiredString(action, 'name', errors);
      const target = requiredString(action, 'target', errors);
      const capability = requiredString(action, 'capability', errors);
      if (actionId && actionIds.has(actionId)) errors.push(`actions contains duplicate id ${actionId}.`);
      actionIds.add(actionId);
      if (target && !identifierPattern.test(target)) errors.push(`actions[${index}].target must be a namespaced lowercase identifier.`);
      if (capability && !identifierPattern.test(capability)) errors.push(`actions[${index}].capability must be a namespaced lowercase identifier.`);
      optionalDuration(action.delayMs, `actions[${index}].delayMs`, errors);
      if (action.arguments !== undefined && !isObject(action.arguments)) errors.push(`actions[${index}].arguments must be an object.`);
      if (action.releaseCapability !== undefined && (typeof action.releaseCapability !== 'string' || !identifierPattern.test(action.releaseCapability))) errors.push(`actions[${index}].releaseCapability must be a namespaced lowercase identifier.`);
      if (action.forwardInteractionPayload !== undefined && typeof action.forwardInteractionPayload !== 'boolean') errors.push(`actions[${index}].forwardInteractionPayload must be a boolean.`);
      if (action.whenPayload !== undefined) {
        if (!isObject(action.whenPayload)) errors.push(`actions[${index}].whenPayload must be an object.`);
        else {
          if (typeof action.whenPayload.field !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(action.whenPayload.field)) errors.push(`actions[${index}].whenPayload.field must be a top-level interaction payload field name.`);
          if (!['string', 'number', 'boolean'].includes(typeof action.whenPayload.equals)) errors.push(`actions[${index}].whenPayload.equals must be a string, number, or boolean.`);
          if (action.whenPayload.ifMissing !== undefined && typeof action.whenPayload.ifMissing !== 'boolean') errors.push(`actions[${index}].whenPayload.ifMissing must be a boolean.`);
        }
      }
      if (action.lease !== undefined) {
        if (!isObject(action.lease)) errors.push(`actions[${index}].lease must be an object.`);
        else {
          const duration = optionalDuration(action.lease.durationMs, `actions[${index}].lease.durationMs`, errors);
          if (!duration) errors.push(`actions[${index}].lease.durationMs must be greater than zero.`);
          if (action.lease.durationInput !== undefined && (typeof action.lease.durationInput !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(action.lease.durationInput))) errors.push(`actions[${index}].lease.durationInput must be a top-level interaction payload field name.`);
          optionalDuration(action.lease.fadeInMs, `actions[${index}].lease.fadeInMs`, errors);
          optionalDuration(action.lease.fadeOutMs, `actions[${index}].lease.fadeOutMs`, errors);
        }
      }
    });
  }

  const maximumConcurrent = source.maximumConcurrent === undefined ? 1 : Number(source.maximumConcurrent);
  if (!Number.isInteger(maximumConcurrent) || maximumConcurrent < 1 || maximumConcurrent > 20) {
    errors.push('maximumConcurrent must be an integer between 1 and 20.');
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors,
    value: {
      ...source,
      schemaVersion: 1,
      id,
      name,
      enabled: source.enabled as boolean,
      trigger: trigger as unknown as TempestWorkflowTrigger,
      actions: actions as unknown as TempestWorkflowAction[],
      maximumConcurrent
    } as TempestWorkflowDefinition
  };
}

export function createBridgeMessage<T>(message: Omit<TempestBridgeMessage<T>, 'protocolVersion' | 'id' | 'timestamp'> & Partial<Pick<TempestBridgeMessage<T>, 'id' | 'timestamp'>>): TempestBridgeMessage<T> {
  return {
    protocolVersion: TEMPEST_PROTOCOL_VERSION,
    id: message.id || globalThis.crypto.randomUUID(),
    timestamp: message.timestamp || new Date().toISOString(),
    ...message
  };
}

export function validateBridgeMessage(input: unknown): ValidationResult<TempestBridgeMessage> {
  const errors: string[] = [];
  if (!isObject(input)) return { ok: false, errors: ['Bridge message must be an object.'] };
  if (input.protocolVersion !== TEMPEST_PROTOCOL_VERSION) errors.push(`protocolVersion must be ${TEMPEST_PROTOCOL_VERSION}.`);
  const id = requiredString(input, 'id', errors);
  const source = requiredString(input, 'source', errors);
  const timestamp = requiredString(input, 'timestamp', errors);
  if (!messageKinds.includes(input.kind as MessageKind)) errors.push(`kind must be one of: ${messageKinds.join(', ')}.`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors, value: { ...input, id, source, timestamp } as unknown as TempestBridgeMessage };
}
