import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

export interface PublicExtensionCatalogItem {
  id: string;
  name: string;
  durationMs: number;
  cooldownMs?: number;
  viewerCooldownMs?: number;
  globalCooldownMs?: number;
  category?: 'sticker' | 'gif' | 'jumpscare' | 'screen-effect' | 'sound' | 'counter' | 'community' | 'other';
  placementMode?: 'fixed' | 'viewer';
  access?: {
    mode: 'everyone' | 'staff' | 'assigned-creators' | 'specific-viewers';
    allowedViewerIds: string[];
    blockedViewerIds: string[];
    hideWhenLocked: boolean;
  };
  accent: string;
  glyph: string;
  kind: 'sound-alert' | 'interaction';
  destinations?: Array<'mainframe' | 'streaming'>;
}

export interface PublicExtensionCompanions {
  schemaVersion: 1;
  mainframe: boolean;
  streaming: boolean;
}

export interface PublicExtensionPoll {
  id: string;
  state: 'active' | 'closed';
  question: string;
  options: Array<{ number: number; label: string; votes: number; percentage: number }>;
  totalVotes: number;
  startedAt: string;
  endedAt?: string;
  lastVoteAt?: string;
}

export interface PublicExtensionCounter {
  id: string;
  command: string;
  trigger?: string;
  label: string;
  value: number;
}

export interface PublicExtensionCommand {
  trigger: string;
  aliases: string[];
  permission: 'everyone' | 'subscriber' | 'moderator' | 'broadcaster';
  allowSharedChat: boolean;
}

export interface PublicExtensionGoal {
  source: 'twitch' | 'studio';
  kind: 'subscriptions' | 'followers' | 'bits' | 'donations' | 'custom';
  title: string;
  currentAmount: number;
  targetAmount: number;
  percentage: number;
  unit: string;
  accent: string;
}

export interface PublicExtensionNowPlaying {
  stationName: string;
  state: 'online' | 'offline' | 'unavailable';
  artist?: string;
  title?: string;
  text?: string;
  album?: string;
  publicPlayerUrl: string;
  checkedAt: string;
}

export interface PublicExtensionSchedule {
  title?: string;
  startTime: string;
}

export interface PublicExtensionStream {
  live: boolean;
  title: string;
  category?: string;
  startedAt?: string;
  viewerCount?: number;
  checkedAt: string;
}

export interface PublicExtensionPanelDesign {
  schemaVersion: 1;
  preset: 'tempest' | 'minimal' | 'neon' | 'soft';
  brandName: string;
  eyebrow: string;
  title: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  font: 'inter' | 'system' | 'condensed' | 'serif';
  cardLayout: 'grid' | 'list';
  density: 'comfortable' | 'compact';
  cornerRadius: number;
  showLogo: boolean;
  showStatus: boolean;
  showSearch: boolean;
  showFilters: boolean;
  showPattern: boolean;
  uppercaseLabels: boolean;
  showCurrentStream: boolean;
  showNowPlaying: boolean;
  showSchedule: boolean;
  showGoal: boolean;
  showPoll: boolean;
  showCounters: boolean;
  showCommands: boolean;
  showDice: boolean;
  showFeatured: boolean;
  showPerformances: boolean;
}

export interface PublicExtensionCatalog {
  schemaVersion: 1;
  companions: PublicExtensionCompanions;
  /** @deprecated Compatibility hint for Studio/EBS versions before 1.5.1. */
  extensionEdition: 'free' | 'bits';
  updatedAt: string;
  items: PublicExtensionCatalogItem[];
  poll?: PublicExtensionPoll;
  counters?: PublicExtensionCounter[];
  commands?: PublicExtensionCommand[];
  goal?: PublicExtensionGoal;
  nowPlaying?: PublicExtensionNowPlaying;
  schedule?: PublicExtensionSchedule;
  stream?: PublicExtensionStream;
  panelDesign?: PublicExtensionPanelDesign;
}

export interface TwitchEbsInstallation {
  id: string;
  channelId: string;
  channelLogin: string;
  relayTokenHash: string;
  active: boolean;
  catalog: PublicExtensionCatalog;
  createdAt: string;
  updatedAt: string;
}

export interface BitsReservationRecord {
  token: string;
  channelId: string;
  viewerId: string;
  sku: string;
  action: string;
  expiresAt: string;
  placement?: { x: number; y: number };
}

export interface BitsDeliveryRecord {
  transactionId: string;
  requestId: string;
  channelId: string;
  viewerId: string;
  sku: string;
  action: string;
  bits: number;
  event: unknown;
  state: 'pending' | 'accepted' | 'rejected';
  responseStatus?: number;
  responseBody?: unknown;
  acceptedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BitsEligibilityState {
  lastGlobalAcceptedAt?: string;
  lastViewerAcceptedAt?: string;
  activeReservationExpiresAt?: string;
}

export interface TwitchEbsInstallationStore {
  initialize(): Promise<void>;
  install(channelId: string, channelLogin: string, relayTokenHash: string): Promise<TwitchEbsInstallation>;
  findActiveByChannelId(channelId: string): Promise<TwitchEbsInstallation | null>;
  findActiveByRelayTokenHash(relayTokenHash: string): Promise<TwitchEbsInstallation | null>;
  updateCatalog(installationId: string, catalog: PublicExtensionCatalog): Promise<void>;
  updatePanelDesign(installationId: string, panelDesign: PublicExtensionPanelDesign): Promise<void>;
  getBitsEligibilityState(channelId: string, action: string, viewerId: string): Promise<BitsEligibilityState>;
  reserveBitsInteraction(reservation: BitsReservationRecord, globalCooldownMs: number, viewerCooldownMs: number): Promise<{ created: boolean; retryAfterMs: number }>;
  findBitsReservation(token: string): Promise<BitsReservationRecord | null>;
  findBitsDelivery(transactionId: string): Promise<BitsDeliveryRecord | null>;
  createBitsDelivery(reservationToken: string, delivery: BitsDeliveryRecord): Promise<BitsDeliveryRecord | null>;
  listPendingBitsDeliveries(channelId: string, limit: number): Promise<BitsDeliveryRecord[]>;
  completeBitsDelivery(transactionId: string, state: 'accepted' | 'rejected', responseStatus: number, responseBody: unknown): Promise<BitsDeliveryRecord | null>;
  revoke(installationId: string): Promise<void>;
  countActive(): Promise<number>;
  close(): Promise<void>;
}

export const emptyPublicExtensionCatalog = (): PublicExtensionCatalog => ({
  schemaVersion: 1,
  companions: { schemaVersion: 1, mainframe: true, streaming: true },
  extensionEdition: 'free',
  updatedAt: new Date().toISOString(),
  items: []
});

function copy<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryTwitchEbsInstallationStore implements TwitchEbsInstallationStore {
  private readonly installations = new Map<string, TwitchEbsInstallation>();
  private readonly bitsReservations = new Map<string, BitsReservationRecord>();
  private readonly bitsDeliveries = new Map<string, BitsDeliveryRecord>();

  async initialize(): Promise<void> {}

  async install(channelId: string, channelLogin: string, relayTokenHash: string): Promise<TwitchEbsInstallation> {
    const existing = [...this.installations.values()].find((entry) => entry.channelId === channelId);
    const now = new Date().toISOString();
    const installation: TwitchEbsInstallation = {
      id: existing?.id || randomUUID(),
      channelId,
      channelLogin,
      relayTokenHash,
      active: true,
      catalog: existing?.catalog || emptyPublicExtensionCatalog(),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    this.installations.set(installation.id, installation);
    return copy(installation);
  }

  async findActiveByChannelId(channelId: string): Promise<TwitchEbsInstallation | null> {
    const installation = [...this.installations.values()].find((entry) => entry.active && entry.channelId === channelId);
    return installation ? copy(installation) : null;
  }

  async findActiveByRelayTokenHash(relayTokenHash: string): Promise<TwitchEbsInstallation | null> {
    const installation = [...this.installations.values()].find((entry) => entry.active && entry.relayTokenHash === relayTokenHash);
    return installation ? copy(installation) : null;
  }

  async updateCatalog(installationId: string, catalog: PublicExtensionCatalog): Promise<void> {
    const installation = this.installations.get(installationId);
    if (!installation || !installation.active) throw new Error('Installation is not active.');
    installation.catalog = copy({
      ...catalog,
      ...(catalog.panelDesign ? {} : { panelDesign: installation.catalog.panelDesign })
    });
    installation.updatedAt = new Date().toISOString();
  }

  async updatePanelDesign(installationId: string, panelDesign: PublicExtensionPanelDesign): Promise<void> {
    const installation = this.installations.get(installationId);
    if (!installation || !installation.active) throw new Error('Installation is not active.');
    installation.catalog.panelDesign = copy(panelDesign);
    installation.catalog.updatedAt = new Date().toISOString();
    installation.updatedAt = installation.catalog.updatedAt;
  }

  private expireBitsReservations(now = Date.now()): void {
    for (const [token, reservation] of this.bitsReservations) {
      if (new Date(reservation.expiresAt).getTime() <= now) this.bitsReservations.delete(token);
    }
  }

  async getBitsEligibilityState(channelId: string, action: string, viewerId: string): Promise<BitsEligibilityState> {
    this.expireBitsReservations();
    const accepted = [...this.bitsDeliveries.values()].filter((entry) => entry.state === 'accepted' && entry.channelId === channelId && entry.action === action && entry.acceptedAt);
    const newest = (values: string[]): string | undefined => values.sort().at(-1);
    return {
      lastGlobalAcceptedAt: newest(accepted.map((entry) => entry.acceptedAt!)),
      lastViewerAcceptedAt: newest(accepted.filter((entry) => entry.viewerId === viewerId).map((entry) => entry.acceptedAt!)),
      activeReservationExpiresAt: newest([...this.bitsReservations.values()].filter((entry) => entry.channelId === channelId && entry.action === action).map((entry) => entry.expiresAt))
    };
  }

  async reserveBitsInteraction(reservation: BitsReservationRecord, globalCooldownMs: number, viewerCooldownMs: number): Promise<{ created: boolean; retryAfterMs: number }> {
    const now = Date.now();
    const state = await this.getBitsEligibilityState(reservation.channelId, reservation.action, reservation.viewerId);
    const remaining = (timestamp: string | undefined, duration: number): number => timestamp ? Math.max(0, new Date(timestamp).getTime() + duration - now) : 0;
    const retryAfterMs = Math.max(
      remaining(state.lastGlobalAcceptedAt, globalCooldownMs),
      remaining(state.lastViewerAcceptedAt, viewerCooldownMs),
      state.activeReservationExpiresAt ? Math.max(0, new Date(state.activeReservationExpiresAt).getTime() - now) : 0
    );
    if (retryAfterMs) return { created: false, retryAfterMs };
    this.bitsReservations.set(reservation.token, copy(reservation));
    return { created: true, retryAfterMs: 0 };
  }

  async findBitsDelivery(transactionId: string): Promise<BitsDeliveryRecord | null> {
    const delivery = this.bitsDeliveries.get(transactionId);
    return delivery ? copy(delivery) : null;
  }

  async findBitsReservation(token: string): Promise<BitsReservationRecord | null> {
    this.expireBitsReservations();
    const reservation = this.bitsReservations.get(token);
    return reservation ? copy(reservation) : null;
  }

  async createBitsDelivery(reservationToken: string, delivery: BitsDeliveryRecord): Promise<BitsDeliveryRecord | null> {
    const existing = this.bitsDeliveries.get(delivery.transactionId);
    if (existing) return copy(existing);
    this.expireBitsReservations();
    const reservation = this.bitsReservations.get(reservationToken);
    if (!reservation || reservation.channelId !== delivery.channelId || reservation.viewerId !== delivery.viewerId || reservation.sku !== delivery.sku || reservation.action !== delivery.action) return null;
    this.bitsReservations.delete(reservationToken);
    const saved = copy(delivery);
    this.bitsDeliveries.set(saved.transactionId, saved);
    return copy(saved);
  }

  async listPendingBitsDeliveries(channelId: string, limit: number): Promise<BitsDeliveryRecord[]> {
    return [...this.bitsDeliveries.values()]
      .filter((entry) => entry.channelId === channelId && entry.state === 'pending')
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, limit)
      .map(copy);
  }

  async completeBitsDelivery(transactionId: string, state: 'accepted' | 'rejected', responseStatus: number, responseBody: unknown): Promise<BitsDeliveryRecord | null> {
    const delivery = this.bitsDeliveries.get(transactionId);
    if (!delivery) return null;
    const now = new Date().toISOString();
    delivery.state = state;
    delivery.responseStatus = responseStatus;
    delivery.responseBody = copy(responseBody ?? null);
    delivery.updatedAt = now;
    if (state === 'accepted') delivery.acceptedAt = now;
    return copy(delivery);
  }

  async revoke(installationId: string): Promise<void> {
    this.installations.delete(installationId);
  }

  async countActive(): Promise<number> {
    return [...this.installations.values()].filter((entry) => entry.active).length;
  }

  async close(): Promise<void> {}
}

interface InstallationRow {
  id: string;
  channel_id: string;
  channel_login: string;
  relay_token_hash: string;
  active: boolean;
  catalog: PublicExtensionCatalog;
  created_at: Date | string;
  updated_at: Date | string;
}

interface BitsDeliveryRow {
  transaction_id: string;
  request_id: string;
  channel_id: string;
  viewer_id: string;
  sku: string;
  action: string;
  bits: number;
  event: unknown;
  state: 'pending' | 'accepted' | 'rejected';
  response_status: number | null;
  response_body: unknown;
  accepted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function bitsDeliveryFromRow(row: BitsDeliveryRow): BitsDeliveryRecord {
  return {
    transactionId: row.transaction_id,
    requestId: row.request_id,
    channelId: row.channel_id,
    viewerId: row.viewer_id,
    sku: row.sku,
    action: row.action,
    bits: row.bits,
    event: row.event,
    state: row.state,
    ...(row.response_status === null ? {} : { responseStatus: row.response_status }),
    ...(row.response_body === null ? {} : { responseBody: row.response_body }),
    ...(row.accepted_at ? { acceptedAt: new Date(row.accepted_at).toISOString() } : {}),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function fromRow(row: InstallationRow): TwitchEbsInstallation {
  const catalog = row.catalog || emptyPublicExtensionCatalog();
  const legacyEdition = catalog.extensionEdition === 'bits' ? 'bits' : 'free';
  const companions = catalog.companions && typeof catalog.companions === 'object'
    ? { schemaVersion: 1 as const, mainframe: catalog.companions.mainframe === true, streaming: catalog.companions.streaming === true }
    : legacyEdition === 'bits'
      ? { schemaVersion: 1 as const, mainframe: false, streaming: true }
      : { schemaVersion: 1 as const, mainframe: true, streaming: false };
  return {
    id: row.id,
    channelId: row.channel_id,
    channelLogin: row.channel_login,
    relayTokenHash: row.relay_token_hash,
    active: row.active,
    catalog: { ...catalog, companions, extensionEdition: legacyEdition },
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

export class PostgresTwitchEbsInstallationStore implements TwitchEbsInstallationStore {
  private readonly pool: Pool;

  constructor(connectionString: string, ssl = false) {
    if (!connectionString.trim()) throw new Error('DATABASE_URL is required for the PostgreSQL installation store.');
    this.pool = new Pool({ connectionString, ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}) });
  }

  async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tempest_extension_installations (
        id uuid PRIMARY KEY,
        channel_id varchar(30) NOT NULL UNIQUE,
        channel_login varchar(80) NOT NULL,
        relay_token_hash char(64) NOT NULL UNIQUE,
        active boolean NOT NULL DEFAULT true,
        catalog jsonb NOT NULL DEFAULT '{"schemaVersion":1,"updatedAt":"1970-01-01T00:00:00.000Z","items":[]}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tempest_bits_reservations (
        token varchar(64) PRIMARY KEY,
        channel_id varchar(30) NOT NULL,
        viewer_id varchar(30) NOT NULL,
        sku varchar(255) NOT NULL,
        action varchar(255) NOT NULL,
        expires_at timestamptz NOT NULL,
        placement jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query('CREATE INDEX IF NOT EXISTS tempest_bits_reservations_channel_action_idx ON tempest_bits_reservations (channel_id, action, expires_at)');
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tempest_bits_deliveries (
        transaction_id varchar(255) PRIMARY KEY,
        request_id varchar(128) NOT NULL UNIQUE,
        channel_id varchar(30) NOT NULL,
        viewer_id varchar(30) NOT NULL,
        sku varchar(255) NOT NULL,
        action varchar(255) NOT NULL,
        bits integer NOT NULL CHECK (bits > 0),
        event jsonb NOT NULL,
        state varchar(16) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'accepted', 'rejected')),
        response_status integer,
        response_body jsonb,
        accepted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query('CREATE INDEX IF NOT EXISTS tempest_bits_deliveries_pending_idx ON tempest_bits_deliveries (channel_id, created_at) WHERE state = \'pending\'');
    await this.pool.query('CREATE INDEX IF NOT EXISTS tempest_bits_deliveries_cooldown_idx ON tempest_bits_deliveries (channel_id, action, viewer_id, accepted_at) WHERE state = \'accepted\'');
  }

  async install(channelId: string, channelLogin: string, relayTokenHash: string): Promise<TwitchEbsInstallation> {
    const result = await this.pool.query<InstallationRow>(`
      INSERT INTO tempest_extension_installations (id, channel_id, channel_login, relay_token_hash, active)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (channel_id) DO UPDATE SET
        channel_login = EXCLUDED.channel_login,
        relay_token_hash = EXCLUDED.relay_token_hash,
        active = true,
        updated_at = now()
      RETURNING *
    `, [randomUUID(), channelId, channelLogin, relayTokenHash]);
    return fromRow(result.rows[0]);
  }

  async findActiveByChannelId(channelId: string): Promise<TwitchEbsInstallation | null> {
    const result = await this.pool.query<InstallationRow>('SELECT * FROM tempest_extension_installations WHERE channel_id = $1 AND active = true LIMIT 1', [channelId]);
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async findActiveByRelayTokenHash(relayTokenHash: string): Promise<TwitchEbsInstallation | null> {
    const result = await this.pool.query<InstallationRow>('SELECT * FROM tempest_extension_installations WHERE relay_token_hash = $1 AND active = true LIMIT 1', [relayTokenHash]);
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async updateCatalog(installationId: string, catalog: PublicExtensionCatalog): Promise<void> {
    const result = await this.pool.query(`
      UPDATE tempest_extension_installations
      SET catalog = CASE
        WHEN catalog ? 'panelDesign' AND NOT ($2::jsonb ? 'panelDesign')
          THEN $2::jsonb || jsonb_build_object('panelDesign', catalog->'panelDesign')
        ELSE $2::jsonb
      END,
      updated_at = now()
      WHERE id = $1 AND active = true
    `, [installationId, JSON.stringify(catalog)]);
    if (!result.rowCount) throw new Error('Installation is not active.');
  }

  async updatePanelDesign(installationId: string, panelDesign: PublicExtensionPanelDesign): Promise<void> {
    const result = await this.pool.query(`
      UPDATE tempest_extension_installations
      SET catalog = jsonb_set(catalog, '{panelDesign}', $2::jsonb, true), updated_at = now()
      WHERE id = $1 AND active = true
    `, [installationId, JSON.stringify(panelDesign)]);
    if (!result.rowCount) throw new Error('Installation is not active.');
  }

  async getBitsEligibilityState(channelId: string, action: string, viewerId: string): Promise<BitsEligibilityState> {
    await this.pool.query('DELETE FROM tempest_bits_reservations WHERE expires_at <= now()');
    const result = await this.pool.query<{
      last_global_accepted_at: Date | string | null;
      last_viewer_accepted_at: Date | string | null;
      active_reservation_expires_at: Date | string | null;
    }>(`
      SELECT
        (SELECT max(accepted_at) FROM tempest_bits_deliveries WHERE channel_id = $1 AND action = $2 AND state = 'accepted') AS last_global_accepted_at,
        (SELECT max(accepted_at) FROM tempest_bits_deliveries WHERE channel_id = $1 AND action = $2 AND viewer_id = $3 AND state = 'accepted') AS last_viewer_accepted_at,
        (SELECT max(expires_at) FROM tempest_bits_reservations WHERE channel_id = $1 AND action = $2 AND expires_at > now()) AS active_reservation_expires_at
    `, [channelId, action, viewerId]);
    const row = result.rows[0];
    return {
      ...(row?.last_global_accepted_at ? { lastGlobalAcceptedAt: new Date(row.last_global_accepted_at).toISOString() } : {}),
      ...(row?.last_viewer_accepted_at ? { lastViewerAcceptedAt: new Date(row.last_viewer_accepted_at).toISOString() } : {}),
      ...(row?.active_reservation_expires_at ? { activeReservationExpiresAt: new Date(row.active_reservation_expires_at).toISOString() } : {})
    };
  }

  async reserveBitsInteraction(reservation: BitsReservationRecord, globalCooldownMs: number, viewerCooldownMs: number): Promise<{ created: boolean; retryAfterMs: number }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${reservation.channelId}:${reservation.action}`]);
      await client.query('DELETE FROM tempest_bits_reservations WHERE expires_at <= now()');
      const state = await client.query<{
        last_global_accepted_at: Date | string | null;
        last_viewer_accepted_at: Date | string | null;
        active_reservation_expires_at: Date | string | null;
        server_now: Date | string;
      }>(`
        SELECT
          (SELECT max(accepted_at) FROM tempest_bits_deliveries WHERE channel_id = $1 AND action = $2 AND state = 'accepted') AS last_global_accepted_at,
          (SELECT max(accepted_at) FROM tempest_bits_deliveries WHERE channel_id = $1 AND action = $2 AND viewer_id = $3 AND state = 'accepted') AS last_viewer_accepted_at,
          (SELECT max(expires_at) FROM tempest_bits_reservations WHERE channel_id = $1 AND action = $2 AND expires_at > now()) AS active_reservation_expires_at,
          now() AS server_now
      `, [reservation.channelId, reservation.action, reservation.viewerId]);
      const row = state.rows[0];
      const now = new Date(row.server_now).getTime();
      const remaining = (timestamp: Date | string | null, duration: number): number => timestamp ? Math.max(0, new Date(timestamp).getTime() + duration - now) : 0;
      const retryAfterMs = Math.max(
        remaining(row.last_global_accepted_at, globalCooldownMs),
        remaining(row.last_viewer_accepted_at, viewerCooldownMs),
        row.active_reservation_expires_at ? Math.max(0, new Date(row.active_reservation_expires_at).getTime() - now) : 0
      );
      if (retryAfterMs) {
        await client.query('COMMIT');
        return { created: false, retryAfterMs };
      }
      await client.query(`
        INSERT INTO tempest_bits_reservations (token, channel_id, viewer_id, sku, action, expires_at, placement)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `, [reservation.token, reservation.channelId, reservation.viewerId, reservation.sku, reservation.action, reservation.expiresAt, reservation.placement ? JSON.stringify(reservation.placement) : null]);
      await client.query('COMMIT');
      return { created: true, retryAfterMs: 0 };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findBitsDelivery(transactionId: string): Promise<BitsDeliveryRecord | null> {
    const result = await this.pool.query<BitsDeliveryRow>('SELECT * FROM tempest_bits_deliveries WHERE transaction_id = $1 LIMIT 1', [transactionId]);
    return result.rows[0] ? bitsDeliveryFromRow(result.rows[0]) : null;
  }

  async findBitsReservation(token: string): Promise<BitsReservationRecord | null> {
    const result = await this.pool.query<{
      token: string;
      channel_id: string;
      viewer_id: string;
      sku: string;
      action: string;
      expires_at: Date | string;
      placement: { x: number; y: number } | null;
    }>(`
      SELECT token, channel_id, viewer_id, sku, action, expires_at, placement
      FROM tempest_bits_reservations
      WHERE token = $1 AND expires_at > now()
      LIMIT 1
    `, [token]);
    const row = result.rows[0];
    return row ? {
      token: row.token,
      channelId: row.channel_id,
      viewerId: row.viewer_id,
      sku: row.sku,
      action: row.action,
      expiresAt: new Date(row.expires_at).toISOString(),
      ...(row.placement ? { placement: row.placement } : {})
    } : null;
  }

  async createBitsDelivery(reservationToken: string, delivery: BitsDeliveryRecord): Promise<BitsDeliveryRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<BitsDeliveryRow>('SELECT * FROM tempest_bits_deliveries WHERE transaction_id = $1 FOR UPDATE', [delivery.transactionId]);
      if (existing.rows[0]) {
        await client.query('COMMIT');
        return bitsDeliveryFromRow(existing.rows[0]);
      }
      const reservation = await client.query(`
        DELETE FROM tempest_bits_reservations
        WHERE token = $1 AND channel_id = $2 AND viewer_id = $3 AND sku = $4 AND action = $5 AND expires_at > now()
        RETURNING token
      `, [reservationToken, delivery.channelId, delivery.viewerId, delivery.sku, delivery.action]);
      if (!reservation.rowCount) {
        await client.query('ROLLBACK');
        return null;
      }
      const inserted = await client.query<BitsDeliveryRow>(`
        INSERT INTO tempest_bits_deliveries (transaction_id, request_id, channel_id, viewer_id, sku, action, bits, event, state, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'pending', $9, $10)
        RETURNING *
      `, [delivery.transactionId, delivery.requestId, delivery.channelId, delivery.viewerId, delivery.sku, delivery.action, delivery.bits, JSON.stringify(delivery.event), delivery.createdAt, delivery.updatedAt]);
      await client.query('COMMIT');
      return bitsDeliveryFromRow(inserted.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listPendingBitsDeliveries(channelId: string, limit: number): Promise<BitsDeliveryRecord[]> {
    const result = await this.pool.query<BitsDeliveryRow>(`
      SELECT * FROM tempest_bits_deliveries
      WHERE channel_id = $1 AND state = 'pending'
      ORDER BY created_at ASC
      LIMIT $2
    `, [channelId, Math.max(1, Math.min(100, limit))]);
    return result.rows.map(bitsDeliveryFromRow);
  }

  async completeBitsDelivery(transactionId: string, state: 'accepted' | 'rejected', responseStatus: number, responseBody: unknown): Promise<BitsDeliveryRecord | null> {
    const result = await this.pool.query<BitsDeliveryRow>(`
      UPDATE tempest_bits_deliveries
      SET state = $2,
          response_status = $3,
          response_body = $4::jsonb,
          accepted_at = CASE WHEN $2 = 'accepted' THEN now() ELSE accepted_at END,
          updated_at = now()
      WHERE transaction_id = $1
      RETURNING *
    `, [transactionId, state, responseStatus, JSON.stringify(responseBody ?? null)]);
    return result.rows[0] ? bitsDeliveryFromRow(result.rows[0]) : null;
  }

  async revoke(installationId: string): Promise<void> {
    await this.pool.query('DELETE FROM tempest_extension_installations WHERE id = $1', [installationId]);
  }

  async countActive(): Promise<number> {
    const result = await this.pool.query<{ count: string }>('SELECT count(*)::text AS count FROM tempest_extension_installations WHERE active = true');
    return Number(result.rows[0]?.count || 0);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
