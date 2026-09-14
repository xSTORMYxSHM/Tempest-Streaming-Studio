import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

export interface PublicExtensionCatalogItem {
  id: string;
  name: string;
  durationMs: number;
  cooldownMs?: number;
  accent: string;
  glyph: string;
  kind: 'sound-alert' | 'interaction';
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
}

export interface PublicExtensionCatalog {
  schemaVersion: 1;
  updatedAt: string;
  items: PublicExtensionCatalogItem[];
  panelDesign?: PublicExtensionPanelDesign;
}

export interface TwitchEbsInstallation {
  id: string;
  channelId: string;
  channelLogin: string;
  kickUserId?: string;
  kickUsername?: string;
  relayTokenHash: string;
  active: boolean;
  catalog: PublicExtensionCatalog;
  createdAt: string;
  updatedAt: string;
}

export interface TwitchEbsInstallationStore {
  initialize(): Promise<void>;
  install(channelId: string, channelLogin: string, relayTokenHash: string): Promise<TwitchEbsInstallation>;
  findActiveByChannelId(channelId: string): Promise<TwitchEbsInstallation | null>;
  findActiveByRelayTokenHash(relayTokenHash: string): Promise<TwitchEbsInstallation | null>;
  findActiveByKickUserId(kickUserId: string): Promise<TwitchEbsInstallation | null>;
  linkKick(installationId: string, kickUserId: string, kickUsername: string): Promise<TwitchEbsInstallation>;
  unlinkKick(installationId: string): Promise<void>;
  updateCatalog(installationId: string, catalog: PublicExtensionCatalog): Promise<void>;
  updatePanelDesign(installationId: string, panelDesign: PublicExtensionPanelDesign): Promise<void>;
  revoke(installationId: string): Promise<void>;
  countActive(): Promise<number>;
  close(): Promise<void>;
}

export const emptyPublicExtensionCatalog = (): PublicExtensionCatalog => ({
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
  items: []
});

function copy<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryTwitchEbsInstallationStore implements TwitchEbsInstallationStore {
  private readonly installations = new Map<string, TwitchEbsInstallation>();

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

  async findActiveByKickUserId(kickUserId: string): Promise<TwitchEbsInstallation | null> {
    const installation = [...this.installations.values()].find((entry) => entry.active && entry.kickUserId === kickUserId);
    return installation ? copy(installation) : null;
  }

  async linkKick(installationId: string, kickUserId: string, kickUsername: string): Promise<TwitchEbsInstallation> {
    const installation = this.installations.get(installationId);
    if (!installation || !installation.active) throw new Error('Installation is not active.');
    for (const entry of this.installations.values()) {
      if (entry.id !== installationId && entry.kickUserId === kickUserId) {
        entry.kickUserId = undefined;
        entry.kickUsername = undefined;
      }
    }
    installation.kickUserId = kickUserId;
    installation.kickUsername = kickUsername;
    installation.updatedAt = new Date().toISOString();
    return copy(installation);
  }

  async unlinkKick(installationId: string): Promise<void> {
    const installation = this.installations.get(installationId);
    if (!installation || !installation.active) return;
    installation.kickUserId = undefined;
    installation.kickUsername = undefined;
    installation.updatedAt = new Date().toISOString();
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
  kick_user_id: string | null;
  kick_username: string | null;
  relay_token_hash: string;
  active: boolean;
  catalog: PublicExtensionCatalog;
  created_at: Date | string;
  updated_at: Date | string;
}

function fromRow(row: InstallationRow): TwitchEbsInstallation {
  return {
    id: row.id,
    channelId: row.channel_id,
    channelLogin: row.channel_login,
    kickUserId: row.kick_user_id || undefined,
    kickUsername: row.kick_username || undefined,
    relayTokenHash: row.relay_token_hash,
    active: row.active,
    catalog: row.catalog || emptyPublicExtensionCatalog(),
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
        kick_user_id varchar(30) UNIQUE,
        kick_username varchar(120),
        relay_token_hash char(64) NOT NULL UNIQUE,
        active boolean NOT NULL DEFAULT true,
        catalog jsonb NOT NULL DEFAULT '{"schemaVersion":1,"updatedAt":"1970-01-01T00:00:00.000Z","items":[]}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query('ALTER TABLE tempest_extension_installations ADD COLUMN IF NOT EXISTS kick_user_id varchar(30) UNIQUE');
    await this.pool.query('ALTER TABLE tempest_extension_installations ADD COLUMN IF NOT EXISTS kick_username varchar(120)');
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

  async findActiveByKickUserId(kickUserId: string): Promise<TwitchEbsInstallation | null> {
    const result = await this.pool.query<InstallationRow>('SELECT * FROM tempest_extension_installations WHERE kick_user_id = $1 AND active = true LIMIT 1', [kickUserId]);
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async linkKick(installationId: string, kickUserId: string, kickUsername: string): Promise<TwitchEbsInstallation> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE tempest_extension_installations SET kick_user_id = NULL, kick_username = NULL, updated_at = now() WHERE kick_user_id = $1 AND id <> $2', [kickUserId, installationId]);
      const result = await client.query<InstallationRow>('UPDATE tempest_extension_installations SET kick_user_id = $2, kick_username = $3, updated_at = now() WHERE id = $1 AND active = true RETURNING *', [installationId, kickUserId, kickUsername]);
      if (!result.rows[0]) throw new Error('Installation is not active.');
      await client.query('COMMIT');
      return fromRow(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async unlinkKick(installationId: string): Promise<void> {
    await this.pool.query('UPDATE tempest_extension_installations SET kick_user_id = NULL, kick_username = NULL, updated_at = now() WHERE id = $1 AND active = true', [installationId]);
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
