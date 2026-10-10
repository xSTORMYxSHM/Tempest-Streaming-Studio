export const INTERACTION_RECIPE_SCHEMA_VERSION = 1 as const;

export type InteractionRecipeTriggerType = 'chat-command' | 'extension-action' | 'operator';
export type InteractionRecipeActionType = 'alert' | 'stage-message' | 'viewer-state' | 'viewer-attack' | 'pet-action' | 'battle-start';

export interface InteractionRecipeTrigger {
  type: InteractionRecipeTriggerType;
  value: string;
}

export interface InteractionRecipeAction {
  id: string;
  type: InteractionRecipeActionType;
  delayMs: number;
  settings: Record<string, string | number | boolean>;
}

export interface InteractionRecipe {
  schemaVersion: typeof INTERACTION_RECIPE_SCHEMA_VERSION;
  id: string;
  name: string;
  enabled: boolean;
  trigger: InteractionRecipeTrigger;
  cooldownMs: number;
  actions: InteractionRecipeAction[];
  createdAt: string;
  updatedAt: string;
}

export interface InteractionRecipeExecutionContext {
  source: string;
  viewerKey?: string;
  viewerName?: string;
  input?: string;
  eventId?: string;
}
