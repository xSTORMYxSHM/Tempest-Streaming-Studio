import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { INTERACTION_RECIPE_SCHEMA_VERSION, InteractionRecipe, InteractionRecipeAction, InteractionRecipeExecutionContext, InteractionRecipeTriggerType } from '@tempest/contracts';

type Dispatcher = (action: InteractionRecipeAction, context: InteractionRecipeExecutionContext) => Promise<unknown>;
const ids = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const triggerTypes = new Set<InteractionRecipeTriggerType>(['chat-command', 'extension-action', 'operator']);
const actionTypes = new Set(['alert', 'stage-message']);
const clone = <T>(value: T): T => structuredClone(value);

export class TempestInteractionComposer {
  private readonly filePath: string;
  private recipes: InteractionRecipe[] = [];
  private readonly cooldowns = new Map<string, number>();
  private dispatcher?: Dispatcher;

  constructor(dataDirectory: string) { this.filePath = path.join(dataDirectory, 'interaction-recipes.json'); }
  async initialize(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as { recipes?: unknown };
      this.recipes = Array.isArray(parsed.recipes) ? parsed.recipes.map((recipe) => this.validate(recipe)).slice(0, 100) : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await this.persist();
    }
  }
  setDispatcher(dispatcher: Dispatcher): void { this.dispatcher = dispatcher; }
  status(): { recipes: InteractionRecipe[]; enabled: number } { return { recipes: this.recipes.map(clone), enabled: this.recipes.filter((recipe) => recipe.enabled).length }; }
  async save(value: unknown): Promise<InteractionRecipe> {
    const recipe = this.validate(value);
    const index = this.recipes.findIndex((entry) => entry.id === recipe.id);
    if (index >= 0) this.recipes.splice(index, 1, { ...recipe, createdAt: this.recipes[index].createdAt });
    else this.recipes.push(recipe);
    await this.persist(); return clone(recipe);
  }
  async remove(id: string): Promise<boolean> {
    const index = this.recipes.findIndex((entry) => entry.id === id);
    if (index < 0) return false;
    this.recipes.splice(index, 1); await this.persist(); return true;
  }
  async trigger(id: string, context: InteractionRecipeExecutionContext = { source: 'studio.operator' }, rehearsal = false): Promise<{ recipe: InteractionRecipe; results: unknown[] }> {
    const recipe = this.recipes.find((entry) => entry.id === id);
    if (!recipe) throw new Error(`Interaction recipe ${id} was not found.`);
    if (!recipe.enabled && !rehearsal) throw new Error(`Interaction recipe ${recipe.name} is disabled.`);
    if (!this.dispatcher) throw new Error('Interaction Composer is not connected to the runtime.');
    const key = `${recipe.id}:${context.viewerKey || context.source}`;
    const previous = this.cooldowns.get(key) || 0;
    if (!rehearsal && Date.now() - previous < recipe.cooldownMs) throw new Error(`Interaction recipe ${recipe.name} is cooling down.`);
    this.cooldowns.set(key, Date.now());
    const results: unknown[] = [];
    for (const action of recipe.actions) {
      if (action.delayMs) await new Promise<void>((resolve) => { const timer = setTimeout(resolve, action.delayMs); timer.unref?.(); });
      results.push(await this.dispatcher(action, context));
    }
    return { recipe: clone(recipe), results };
  }
  async handle(triggerType: InteractionRecipeTriggerType, value: string, context: InteractionRecipeExecutionContext): Promise<Array<{ recipeId: string; error?: string }>> {
    const matches = this.recipes.filter((recipe) => recipe.enabled && recipe.trigger.type === triggerType && recipe.trigger.value.toLowerCase() === value.toLowerCase());
    const outcomes: Array<{ recipeId: string; error?: string }> = [];
    for (const recipe of matches) {
      try { await this.trigger(recipe.id, context); outcomes.push({ recipeId: recipe.id }); }
      catch (error) { outcomes.push({ recipeId: recipe.id, error: (error as Error).message }); }
    }
    return outcomes;
  }
  private validate(value: unknown): InteractionRecipe {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Interaction recipe must be an object.');
    const source = value as Record<string, unknown>;
    const id = String(source.id || '').trim().toLowerCase();
    if (!ids.test(id)) throw new Error('Recipe ID must be 2-64 lowercase letters, numbers, dots, dashes, or underscores.');
    const name = String(source.name || '').trim().slice(0, 80);
    if (!name) throw new Error('Recipe name is required.');
    const triggerSource = source.trigger && typeof source.trigger === 'object' && !Array.isArray(source.trigger) ? source.trigger as Record<string, unknown> : {};
    const type = String(triggerSource.type || '') as InteractionRecipeTriggerType;
    if (!triggerTypes.has(type)) throw new Error('Recipe trigger type is invalid.');
    let triggerValue = String(triggerSource.value || '').trim().slice(0, 80);
    if (type === 'chat-command' && !triggerValue.startsWith('!')) triggerValue = `!${triggerValue}`;
    if (!triggerValue) throw new Error('Recipe trigger value is required.');
    if (!Array.isArray(source.actions) || source.actions.length < 1 || source.actions.length > 12) throw new Error('Recipes need 1-12 actions.');
    const actions = source.actions.map((entry, index): InteractionRecipeAction => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Recipe action ${index + 1} must be an object.`);
      const action = entry as Record<string, unknown>;
      const actionType = String(action.type || '');
      if (!actionTypes.has(actionType)) throw new Error(`Recipe action ${index + 1} has an invalid type.`);
      const settingsSource = action.settings && typeof action.settings === 'object' && !Array.isArray(action.settings) ? action.settings as Record<string, unknown> : {};
      const settings: Record<string, string | number | boolean> = {};
      for (const [key, setting] of Object.entries(settingsSource).slice(0, 24)) if (['string', 'number', 'boolean'].includes(typeof setting)) settings[key] = setting as string | number | boolean;
      return { id: String(action.id || `action-${index + 1}`).slice(0, 64), type: actionType as InteractionRecipeAction['type'], delayMs: Math.max(0, Math.min(60_000, Number(action.delayMs) || 0)), settings };
    });
    const now = new Date().toISOString();
    return { schemaVersion: INTERACTION_RECIPE_SCHEMA_VERSION, id, name, enabled: source.enabled !== false, trigger: { type, value: triggerValue }, cooldownMs: Math.max(0, Math.min(3_600_000, Number(source.cooldownMs) || 0)), actions, createdAt: typeof source.createdAt === 'string' ? source.createdAt : now, updatedAt: now };
  }
  private async persist(): Promise<void> {
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ schemaVersion: 1, recipes: this.recipes }, null, 2)}\n`, 'utf8');
    await rename(temporary, this.filePath);
  }
}
