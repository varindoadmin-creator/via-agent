import type { AutomationDefinition } from './types.ts';

const SAFE_ACTIONS = new Set(['READ', 'ANALYZE', 'NOTIFY', 'PREPARE']);

export function validateAutomationDefinition(definition: AutomationDefinition): void {
  if (!definition.name.trim() || !definition.createdBy || !definition.runAsRole) throw new Error('Automation owner and run-as role are required.');
  if (!definition.allowedActions.every(action => SAFE_ACTIONS.has(action))) throw new Error('Automations may only READ, ANALYZE, NOTIFY, or PREPARE in v1.');
  if (definition.autonomyLevel > 3) throw new Error('Autonomy level 4 is not enabled for JARVIS automations.');
  if (definition.maxModelCallsPerRun < 0 || definition.maxModelCallsPerRun > 25 || definition.maxEntitiesPerRun < 1 || definition.maxEntitiesPerRun > 500 || definition.maxRuntimeMs < 1_000 || definition.maxRuntimeMs > 15 * 60_000) throw new Error('Automation limits exceed the v1 bounded-execution policy.');
  if (definition.schedule) {
    if (!Number.isInteger(definition.schedule.hour) || definition.schedule.hour < 0 || definition.schedule.hour > 23 || !Number.isInteger(definition.schedule.minute) || definition.schedule.minute < 0 || definition.schedule.minute > 59) throw new Error('Automation schedule is invalid.');
    new Intl.DateTimeFormat('en-US', { timeZone: definition.timezone }).format();
  }
}

export function mayRunAutomation(definition: AutomationDefinition, input: { activeRun: boolean; permissionGranted: boolean }): { allowed: boolean; reason?: string } {
  if (process.env.JARVIS_AUTOMATIONS_ENABLED !== 'true') return { allowed: false, reason: 'Automations are globally disabled.' };
  if (!definition.enabled) return { allowed: false, reason: 'Automation is disabled.' };
  if (!input.permissionGranted) return { allowed: false, reason: 'Run-as permissions are no longer valid.' };
  if (input.activeRun && definition.concurrencyPolicy === 'SKIP') return { allowed: false, reason: 'A run is already active.' };
  return { allowed: true };
}
