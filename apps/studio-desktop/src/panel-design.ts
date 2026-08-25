export interface TwitchPanelDesign {
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

export const defaultTwitchPanelDesign: TwitchPanelDesign = {
  schemaVersion: 1,
  preset: 'tempest',
  brandName: 'TEMPEST STREAMING STUDIO',
  eyebrow: 'VIEWER CONTROL NODE',
  title: 'Signal deck',
  accent: '#54F2EB',
  background: '#05090E',
  surface: '#09131B',
  text: '#ECF9FF',
  muted: '#79919D',
  font: 'inter',
  cardLayout: 'grid',
  density: 'comfortable',
  cornerRadius: 10,
  showLogo: true,
  showStatus: true,
  showSearch: true,
  showFilters: true,
  showPattern: true,
  uppercaseLabels: true
};

function choice<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function text(value: unknown, fallback: string, maximum: number): string {
  const normalized = String(value ?? '').trim().replace(/[\r\n\0]+/g, ' ');
  return normalized ? normalized.slice(0, maximum) : fallback;
}

function color(value: unknown, fallback: string): string {
  const normalized = String(value || '').trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : fallback;
}

export function validateTwitchPanelDesign(input: unknown): TwitchPanelDesign {
  const source = input && typeof input === 'object' ? input as Partial<TwitchPanelDesign> : {};
  return {
    schemaVersion: 1,
    preset: choice(source.preset, ['tempest', 'minimal', 'neon', 'soft'] as const, defaultTwitchPanelDesign.preset),
    brandName: text(source.brandName, defaultTwitchPanelDesign.brandName, 36),
    eyebrow: text(source.eyebrow, defaultTwitchPanelDesign.eyebrow, 48),
    title: text(source.title, defaultTwitchPanelDesign.title, 48),
    accent: color(source.accent, defaultTwitchPanelDesign.accent),
    background: color(source.background, defaultTwitchPanelDesign.background),
    surface: color(source.surface, defaultTwitchPanelDesign.surface),
    text: color(source.text, defaultTwitchPanelDesign.text),
    muted: color(source.muted, defaultTwitchPanelDesign.muted),
    font: choice(source.font, ['inter', 'system', 'condensed', 'serif'] as const, defaultTwitchPanelDesign.font),
    cardLayout: choice(source.cardLayout, ['grid', 'list'] as const, defaultTwitchPanelDesign.cardLayout),
    density: choice(source.density, ['comfortable', 'compact'] as const, defaultTwitchPanelDesign.density),
    cornerRadius: Math.min(24, Math.max(0, Math.round(Number(source.cornerRadius ?? defaultTwitchPanelDesign.cornerRadius)))),
    showLogo: source.showLogo !== false,
    showStatus: source.showStatus !== false,
    showSearch: source.showSearch !== false,
    showFilters: source.showFilters !== false,
    showPattern: source.showPattern !== false,
    uppercaseLabels: source.uppercaseLabels !== false
  };
}
