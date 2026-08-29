import { JARVIS_TOOL_LABELS } from './tools/catalog.ts';

export interface JarvisToolActivity {
  name: string;
  status: 'completed' | 'failed';
}

export interface JarvisActionPreview {
  kind: 'jarvis_so_preview';
  approval_id: string;
  preview: Record<string, unknown>;
}

export function collectActionPreview(items: Array<{ type?: string; output?: unknown }>): JarvisActionPreview | null {
  for (const item of items) {
    if (item.type !== 'tool_call_output_item' || !item.output) continue;
    let candidate: unknown = item.output;
    if (typeof candidate === 'string') {
      try { candidate = JSON.parse(candidate); } catch { continue; }
    }
    if (!candidate || typeof candidate !== 'object') continue;
    const output = candidate as Partial<JarvisActionPreview>;
    if (output.kind === 'jarvis_so_preview' && typeof output.approval_id === 'string' && output.preview) {
      return output as JarvisActionPreview;
    }
  }
  return null;
}

export function collectToolActivity(items: Array<{ rawItem?: unknown }>): JarvisToolActivity[] {
  const names = new Set<string>();
  for (const item of items) {
    const raw = item.rawItem as { type?: string; name?: string } | undefined;
    if (raw?.type === 'function_call' && raw.name) names.add(raw.name);
  }
  return [...names].map(name => ({
    name: JARVIS_TOOL_LABELS[name] || name,
    status: 'completed',
  }));
}
