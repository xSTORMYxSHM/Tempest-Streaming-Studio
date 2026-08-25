import { randomUUID } from 'node:crypto';
import {
  TempestEventRecord,
  TempestInteractionRequest,
  TempestWorkflowAction,
  TempestWorkflowActionRun,
  TempestWorkflowDefinition,
  TempestWorkflowRun
} from '@tempest/contracts';

export interface WorkflowDispatchRequest {
  runId: string;
  workflowId: string;
  action: TempestWorkflowAction;
  phase: 'activate' | 'release';
  simulateMissing: boolean;
}

export interface WorkflowDispatchResult {
  delivery: 'connected' | 'simulated' | 'unavailable';
}

export type WorkflowDispatcher = (request: WorkflowDispatchRequest) => Promise<WorkflowDispatchResult>;

const terminalActionStates = new Set(['completed', 'released', 'unavailable', 'failed', 'cancelled']);

function copy<T>(value: T): T {
  return structuredClone(value);
}

export const blackHoleWorkflow: TempestWorkflowDefinition = {
  schemaVersion: 1,
  id: 'com.tempestmainframe.workflow.blackhole',
  name: 'Black Hole Event',
  description: 'Coordinates a reversible fifteen-second gravitational event across the Tempest ecosystem.',
  enabled: true,
  trigger: { type: 'viewer.interaction', action: 'tempest.blackhole' },
  cooldowns: { viewerMs: 300000, effectMs: 120000, globalMs: 30000 },
  concurrencyGroup: 'major-event',
  maximumConcurrent: 1,
  actions: [
    {
      id: 'warudo-expression',
      name: 'Warudo black-hole reaction',
      target: 'com.tempestmainframe.warudo',
      capability: 'avatar.reaction.apply',
      arguments: { reactionId: 'tempest-blackhole', expression: 'gravity-shock' },
      lease: { durationMs: 15000, fadeInMs: 250, fadeOutMs: 900 }
    },
    {
      id: 'broadcast-reaction',
      name: 'Broadcast black-hole reaction',
      target: 'com.tempestmainframe.tempest-broadcast',
      capability: 'broadcast.reaction.trigger',
      releaseCapability: 'broadcast.reaction.clear',
      arguments: { reactionId: 'tempest-blackhole', dimIntensity: 0.72, overlay: 'tempest-blackhole-event' },
      lease: { durationMs: 15000, fadeInMs: 450, fadeOutMs: 1100 }
    },
    {
      id: 'quartic-visual',
      name: 'Quartic black-hole fractal',
      target: 'com.tempestmainframe.quartic-pulse',
      capability: 'visual.preset.activate',
      arguments: { preset: 'black-hole-fractal' },
      lease: { durationMs: 15000, fadeInMs: 850, fadeOutMs: 1600 }
    },
    {
      id: 'horizon-gravity',
      name: 'Data Horizon gravity field',
      target: 'com.tempestmainframe.data-horizon',
      capability: 'scene.visualization.activate',
      arguments: { visualization: 'gravitational-collapse' },
      lease: { durationMs: 15000, fadeInMs: 800, fadeOutMs: 1600 }
    },
    {
      id: 'broadcast-audio',
      name: 'Play impact audio',
      target: 'com.tempestmainframe.tempest-broadcast',
      capability: 'broadcast.audio.play',
      arguments: { cue: 'blackhole-impact', bus: 'effects' },
      delayMs: 180
    }
  ]
};

export const soundAlertPerformanceWorkflow: TempestWorkflowDefinition = {
  schemaVersion: 1,
  id: 'com.tempestmainframe.workflow.sound-alert-performance',
  name: 'Sound Alert Performance',
  description: 'Fans a normalized Sound Alert cue out to Warudo and Tempest Broadcast for its supplied performance duration.',
  enabled: true,
  trigger: { type: 'viewer.interaction', action: 'tempest.sound-alert.performance' },
  cooldowns: { viewerMs: 5000, effectMs: 1000, globalMs: 0 },
  concurrencyGroup: 'avatar-performance',
  maximumConcurrent: 1,
  actions: [
    {
      id: 'warudo-performance',
      name: 'Warudo performance cue',
      target: 'com.tempestmainframe.warudo',
      capability: 'avatar.performance.apply',
      arguments: { source: 'sound-alerts' },
      forwardInteractionPayload: true,
      whenPayload: { field: 'warudoEnabled', equals: true },
      lease: { durationMs: 60000, durationInput: 'durationMs', fadeOutMs: 500 }
    },
    {
      id: 'broadcast-performance',
      name: 'Broadcast performance reaction',
      target: 'com.tempestmainframe.tempest-broadcast',
      capability: 'broadcast.reaction.trigger',
      releaseCapability: 'broadcast.reaction.clear',
      arguments: { eventType: 'sound-alert' },
      forwardInteractionPayload: true,
      lease: { durationMs: 60000, durationInput: 'durationMs', fadeOutMs: 500 }
    },
    {
      id: 'broadcast-audio',
      name: 'Broadcast Sound Alert audio',
      target: 'com.tempestmainframe.tempest-broadcast',
      capability: 'broadcast.audio.play',
      arguments: { bus: 'sound-alerts' },
      forwardInteractionPayload: true
    },
    {
      id: 'broadcast-visual',
      name: 'Broadcast Sound Alert visual',
      target: 'com.tempestmainframe.tempest-broadcast',
      capability: 'broadcast.visual.show',
      releaseCapability: 'broadcast.visual.hide',
      arguments: { scene: 'current' },
      forwardInteractionPayload: true,
      lease: { durationMs: 60000, durationInput: 'durationMs', fadeOutMs: 500 }
    }
  ]
};

export const twitchAlertReactionWorkflow: TempestWorkflowDefinition = {
  schemaVersion: 1,
  id: 'com.tempestmainframe.workflow.twitch-alert-reaction',
  name: 'Twitch Alert Reaction',
  description: 'Keeps Tempest Broadcast audio-reactive elements active while the shared Browser Source owns Twitch Alert media and audio.',
  enabled: true,
  trigger: { type: 'system.event', action: 'tempest.twitch-alert.reaction' },
  cooldowns: { viewerMs: 0, effectMs: 0, globalMs: 0 },
  concurrencyGroup: 'twitch-alert-reaction',
  maximumConcurrent: 8,
  actions: [
    {
      id: 'broadcast-reaction',
      name: 'Broadcast Twitch Alert reaction',
      target: 'com.tempestmainframe.tempest-broadcast',
      capability: 'broadcast.reaction.trigger',
      releaseCapability: 'broadcast.reaction.clear',
      arguments: { eventType: 'twitch-alert', circuit: 'alerts', effect: 'spectrum' },
      forwardInteractionPayload: true,
      lease: { durationMs: 60000, durationInput: 'durationMs', fadeOutMs: 350 }
    }
  ]
};

export class TempestWorkflowEngine {
  private workflows: TempestWorkflowDefinition[] = [];
  private runs: TempestWorkflowRun[] = [];
  private runActions = new Map<string, TempestWorkflowAction[]>();
  private events: TempestEventRecord[] = [];
  private timers = new Set<NodeJS.Timeout>();
  private lastEffectTrigger = new Map<string, number>();
  private lastViewerTrigger = new Map<string, number>();
  private eventRuns = new Map<string, string>();
  private lastGlobalTrigger = 0;
  private armed = true;

  constructor(private readonly dispatch: WorkflowDispatcher) {}

  setWorkflows(workflows: TempestWorkflowDefinition[]): void {
    this.workflows = workflows.map(copy);
  }

  listWorkflows(): TempestWorkflowDefinition[] {
    return this.workflows.map(copy);
  }

  listRuns(limit = 40): TempestWorkflowRun[] {
    return this.runs.slice(0, Math.max(1, Math.min(200, limit))).map(copy);
  }

  listEvents(limit = 100): TempestEventRecord[] {
    return this.events.slice(0, Math.max(1, Math.min(500, limit))).map(copy);
  }

  safetyState(): { armed: boolean; activeRuns: number } {
    return { armed: this.armed, activeRuns: this.activeRuns().length };
  }

  arm(): void {
    this.armed = true;
    this.record('system.safety.armed', 'success', 'Viewer interaction workflows armed.');
  }

  recordExternalEvent(type: string, level: TempestEventRecord['level'], message: string, data?: Record<string, unknown>): void {
    this.record(type, level, message, undefined, undefined, data);
  }

  async trigger(workflowId: string, interaction: TempestInteractionRequest): Promise<TempestWorkflowRun> {
    const eventKey = interaction.eventId ? `${interaction.source}:${interaction.eventId}` : undefined;
    if (eventKey) {
      const existingRunId = this.eventRuns.get(eventKey);
      const existingRun = this.runs.find((run) => run.id === existingRunId);
      if (existingRun) {
        this.record('integration.event.duplicate', 'info', `Duplicate event ${interaction.eventId} reused its existing workflow run.`, existingRun, undefined, { eventId: interaction.eventId, source: interaction.source });
        return copy(existingRun);
      }
      this.eventRuns.delete(eventKey);
    }
    if (!this.armed) throw new Error('Viewer interactions are disarmed. Arm Studio before triggering a workflow.');
    const workflow = this.workflows.find((entry) => entry.id === workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} is not registered.`);
    if (!workflow.enabled) throw new Error(`${workflow.name} is disabled.`);
    this.enforceConcurrency(workflow);
    const simulatorBypass = interaction.source === 'studio.simulator' && interaction.bypassCooldown === true;
    if (!simulatorBypass) this.enforceCooldowns(workflow, interaction);

    const now = Date.now();
    const resolvedActions = this.resolveActions(workflow.actions, interaction.payload);
    const longestActionMs = Math.max(0, ...resolvedActions.map((action) => (action.delayMs || 0) + (action.lease?.durationMs || 0)));
    const run: TempestWorkflowRun = {
      id: randomUUID(),
      workflowId: workflow.id,
      workflowName: workflow.name,
      state: 'running',
      source: interaction.source || 'operator.manual',
      triggerEventId: interaction.eventId,
      viewerId: interaction.viewerId,
      viewerName: interaction.viewerName,
      startedAt: new Date(now).toISOString(),
      endsAt: longestActionMs ? new Date(now + longestActionMs).toISOString() : undefined,
      actions: resolvedActions.map((action) => ({
        id: action.id,
        name: action.name,
        target: action.target,
        capability: action.capability,
        releaseCapability: action.releaseCapability,
        state: 'scheduled'
      }))
    };
    this.runs.unshift(run);
    this.runs = this.runs.slice(0, 200);
    this.runActions.set(run.id, resolvedActions);
    if (eventKey) {
      this.eventRuns.set(eventKey, run.id);
      if (this.eventRuns.size > 2000) this.eventRuns.delete(this.eventRuns.keys().next().value as string);
    }
    this.lastEffectTrigger.set(workflow.id, now);
    this.lastGlobalTrigger = now;
    if (interaction.viewerId || interaction.viewerName) {
      this.lastViewerTrigger.set(`${workflow.id}:${interaction.viewerId || interaction.viewerName}`, now);
    }
    this.record('workflow.started', 'success', `${workflow.name} started from ${run.source}.`, run, undefined, {
      viewerName: interaction.viewerName,
      simulated: Boolean(interaction.simulateMissing),
      cooldownBypassed: simulatorBypass
    });

    resolvedActions.forEach((action) => {
      this.schedule(action.delayMs || 0, () => this.activateAction(run, workflow, action, Boolean(interaction.simulateMissing)));
    });
    return copy(run);
  }

  async emergencyStop(reason = 'Operator emergency stop'): Promise<number> {
    this.armed = false;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    const active = this.activeRuns();
    for (const run of active) {
      const workflow = this.workflows.find((entry) => entry.id === run.workflowId);
      if (!workflow) continue;
      const resolvedActions = this.runActions.get(run.id) || workflow.actions;
      for (const actionRun of run.actions) {
        const action = resolvedActions.find((entry) => entry.id === actionRun.id);
        if (actionRun.state === 'active' && action) {
          try { await this.dispatch({ runId: run.id, workflowId: workflow.id, action, phase: 'release', simulateMissing: true }); }
          catch (_) { /* Emergency release continues across targets. */ }
          actionRun.state = 'released';
          actionRun.releasedAt = new Date().toISOString();
        } else if (actionRun.state === 'scheduled') actionRun.state = 'cancelled';
      }
      run.state = 'stopped';
      run.completedAt = new Date().toISOString();
      this.runActions.delete(run.id);
      this.record('workflow.stopped', 'warning', `${run.workflowName} stopped: ${reason}.`, run);
    }
    this.record('system.safety.disarmed', 'warning', `All workflows disarmed. ${reason}.`);
    return active.length;
  }

  close(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.runActions.clear();
  }

  private activeRuns(): TempestWorkflowRun[] {
    return this.runs.filter((run) => run.state === 'pending' || run.state === 'running');
  }

  private enforceConcurrency(workflow: TempestWorkflowDefinition): void {
    const group = workflow.concurrencyGroup || workflow.id;
    const maximum = workflow.maximumConcurrent || 1;
    const active = this.activeRuns().filter((run) => {
      const definition = this.workflows.find((entry) => entry.id === run.workflowId);
      return (definition?.concurrencyGroup || definition?.id) === group;
    });
    if (active.length >= maximum) throw new Error(`${workflow.name} cannot start while ${active[0].workflowName} is active.`);
  }

  private enforceCooldowns(workflow: TempestWorkflowDefinition, interaction: TempestInteractionRequest): void {
    const now = Date.now();
    const cooldowns = workflow.cooldowns || {};
    const effectRemaining = (this.lastEffectTrigger.get(workflow.id) || 0) + (cooldowns.effectMs || 0) - now;
    if (effectRemaining > 0) throw new Error(`${workflow.name} is cooling down for ${Math.ceil(effectRemaining / 1000)} more seconds.`);
    const globalRemaining = this.lastGlobalTrigger + (cooldowns.globalMs || 0) - now;
    if (globalRemaining > 0) throw new Error(`Major interactions are cooling down for ${Math.ceil(globalRemaining / 1000)} more seconds.`);
    const viewer = interaction.viewerId || interaction.viewerName;
    if (viewer) {
      const viewerRemaining = (this.lastViewerTrigger.get(`${workflow.id}:${viewer}`) || 0) + (cooldowns.viewerMs || 0) - now;
      if (viewerRemaining > 0) throw new Error(`${interaction.viewerName || 'This viewer'} can use ${workflow.name} again in ${Math.ceil(viewerRemaining / 1000)} seconds.`);
    }
  }

  private resolveActions(actions: TempestWorkflowAction[], payload: Record<string, unknown> | undefined): TempestWorkflowAction[] {
    return actions.filter((action) => !action.whenPayload || payload?.[action.whenPayload.field] === undefined || payload[action.whenPayload.field] === action.whenPayload.equals).map((action) => {
      const resolved = copy(action);
      if (resolved.forwardInteractionPayload && payload) resolved.arguments = { ...(resolved.arguments || {}), ...payload };
      const durationInput = resolved.lease?.durationInput;
      const suppliedDuration = durationInput && payload ? Number(payload[durationInput]) : Number.NaN;
      if (resolved.lease && Number.isFinite(suppliedDuration) && suppliedDuration > 0) {
        resolved.lease.durationMs = Math.min(resolved.lease.durationMs, Math.round(suppliedDuration));
      }
      return resolved;
    });
  }

  private schedule(delayMs: number, operation: () => Promise<void>): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      void operation();
    }, Math.max(0, delayMs));
    this.timers.add(timer);
  }

  private async activateAction(run: TempestWorkflowRun, workflow: TempestWorkflowDefinition, action: TempestWorkflowAction, simulateMissing: boolean): Promise<void> {
    if (run.state !== 'running') return;
    const actionRun = run.actions.find((entry) => entry.id === action.id) as TempestWorkflowActionRun;
    try {
      const result = await this.dispatch({ runId: run.id, workflowId: workflow.id, action, phase: 'activate', simulateMissing });
      actionRun.delivery = result.delivery;
      actionRun.activatedAt = new Date().toISOString();
      if (result.delivery === 'unavailable') {
        actionRun.state = 'unavailable';
        this.record('workflow.action.unavailable', 'warning', `${action.name} could not reach ${action.target}.`, run, action.target);
      } else if (action.lease) {
        actionRun.state = 'active';
        this.record('workflow.action.activated', 'success', `${action.name} activated via ${result.delivery} delivery.`, run, action.target);
        this.schedule(action.lease.durationMs, () => this.releaseAction(run, workflow, action, simulateMissing));
      } else {
        actionRun.state = 'completed';
        this.record('workflow.action.completed', 'success', `${action.name} completed via ${result.delivery} delivery.`, run, action.target);
      }
    } catch (error) {
      actionRun.state = 'failed';
      actionRun.error = (error as Error).message;
      this.record('workflow.action.failed', 'error', `${action.name} failed: ${actionRun.error}`, run, action.target);
    }
    this.completeIfFinished(run);
  }

  private async releaseAction(run: TempestWorkflowRun, workflow: TempestWorkflowDefinition, action: TempestWorkflowAction, simulateMissing: boolean): Promise<void> {
    if (run.state !== 'running') return;
    const actionRun = run.actions.find((entry) => entry.id === action.id) as TempestWorkflowActionRun;
    if (actionRun.state !== 'active') return;
    try {
      await this.dispatch({ runId: run.id, workflowId: workflow.id, action, phase: 'release', simulateMissing });
      actionRun.state = 'released';
      actionRun.releasedAt = new Date().toISOString();
      this.record('workflow.action.released', 'info', `${action.name} lease expired and released.`, run, action.target);
    } catch (error) {
      actionRun.state = 'failed';
      actionRun.error = (error as Error).message;
      this.record('workflow.action.failed', 'error', `${action.name} release failed: ${actionRun.error}`, run, action.target);
    }
    this.completeIfFinished(run);
  }

  private completeIfFinished(run: TempestWorkflowRun): void {
    if (!run.actions.every((action) => terminalActionStates.has(action.state))) return;
    const degraded = run.actions.some((action) => action.state === 'unavailable' || action.state === 'failed');
    run.state = degraded ? 'partial' : 'completed';
    run.completedAt = new Date().toISOString();
    this.runActions.delete(run.id);
    this.record('workflow.completed', degraded ? 'warning' : 'success', `${run.workflowName} ${degraded ? 'completed with unavailable actions' : 'completed and restored'}.`, run);
  }

  private record(type: string, level: TempestEventRecord['level'], message: string, run?: TempestWorkflowRun, target?: string, data?: Record<string, unknown>): void {
    this.events.unshift({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type,
      level,
      message,
      runId: run?.id,
      workflowId: run?.workflowId,
      target,
      data
    });
    this.events = this.events.slice(0, 500);
  }
}
