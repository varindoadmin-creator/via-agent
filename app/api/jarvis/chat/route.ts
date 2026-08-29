import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth';
import { runJarvis } from '@/lib/jarvis/runner';
import { approveAndCreateSalesOrder } from '@/lib/jarvis/approvals/execute';
import { createJarvisOrchestrationTrace } from '@/lib/jarvis/orchestration';
import { buildJarvisContextPackage } from '@/lib/jarvis/contextBuilder';
import { JarvisMemoryService, explicitForgetPreferenceKey, explicitPreferenceCandidate } from '@/lib/jarvis/memory/service';
import type { JarvisMemory } from '@/lib/jarvis/memory/types';
import { JarvisKnowledgeService } from '@/lib/jarvis/knowledge/service';
import { needsKnowledgeRetrieval } from '@/lib/jarvis/knowledge/policy';
import type { KnowledgeSearchResult } from '@/lib/jarvis/knowledge/types';
import type { ChatResponse } from '@/types/chat';
import { authorizeJarvisAction, createJarvisSecurityIdentity } from '@/lib/jarvis/security/policy';
import { detectPromptInjection, labelUntrustedContent } from '@/lib/jarvis/security/untrustedContent';
import { recordJarvisSecurityEvent } from '@/lib/jarvis/security/events';
import type { JarvisSecurityEvent } from '@/lib/jarvis/security/events';

export const maxDuration = 60;

const requestSchema = z.object({
  message: z.string().trim().min(1).max(20_000),
  conversationId: z.string().min(1).max(160),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(12_000),
  })).max(20).default([]),
  attachments: z.array(z.object({
    name: z.string().max(300),
    extractedText: z.string().max(20_000).optional(),
    content: z.string().max(20_000).optional(),
  }).passthrough()).max(5).optional(),
  pendingAction: z.object({
    type: z.literal('create_so'),
    data: z.object({ approval_id: z.string().uuid() }).passthrough(),
    previewShown: z.literal(true),
  }).nullish(),
});

export async function POST(req: NextRequest): Promise<NextResponse<ChatResponse>> {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) {
    return NextResponse.json({ message: 'Unauthorized', type: 'error', error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      message: 'JARVIS is not configured yet. OPENAI_API_KEY is missing.',
      type: 'error',
      error: 'JARVIS_NOT_CONFIGURED',
    }, { status: 503 });
  }

  try {
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({
        message: 'The JARVIS request is invalid.',
        type: 'error',
        error: 'INVALID_REQUEST',
      }, { status: 400 });
    }

    if (parsed.data.message === 'APPROVE CREATE SO') {
      const approvalId = parsed.data.pendingAction?.data.approval_id;
      if (!approvalId) return NextResponse.json({ message: 'No valid JARVIS Sales Order preview is awaiting approval.', type: 'error', error: 'NO_PENDING_APPROVAL' }, { status: 409 });
      const security = createJarvisSecurityIdentity({ role, sessionId: parsed.data.conversationId });
      const decision = authorizeJarvisAction({
        identity: security,
        tool: { name: 'create_sales_order', category: 'sales', risk: 'WRITE', permissions: ['sales_order.create'], requiresApproval: true },
        approvalProvided: true,
      });
      recordJarvisSecurityEvent([], {
        timestamp: new Date().toISOString(), requestId: randomUUID(), conversationId: parsed.data.conversationId,
        event: 'authorization_decision', code: decision.code, subject: 'create_sales_order', allowed: decision.allowed,
      });
      if (!decision.allowed) return NextResponse.json({ message: decision.message, type: 'error', error: decision.code }, { status: 403 });
      const created = await approveAndCreateSalesOrder({
        approvalId,
        conversationId: parsed.data.conversationId,
        role,
      });
      return NextResponse.json({
        message: `Draft Sales Order ${created.salesorder_number} was created in Zoho Books.`,
        type: 'action_result',
        metadata: { intent: 'create_so', actionResult: { salesorder_id: created.salesorder_id, salesorder_number: created.salesorder_number } },
      });
    }

    const attachmentTexts = (parsed.data.attachments || [])
      .map(file => ({ name: file.name, text: file.extractedText || file.content || '' }))
      .filter(Boolean)
      .filter(file => file.text);
    const attachmentContext = attachmentTexts
      .map(file => labelUntrustedContent(file.text, `attachment ${file.name}`))
      .join('\n\n');
    const message = attachmentContext
      ? `${parsed.data.message}\n\nAttached document text:\n${attachmentContext}`
      : parsed.data.message;

    const requestId = randomUUID();
    const security = createJarvisSecurityIdentity({ role, sessionId: parsed.data.conversationId });
    const securityEvents: JarvisSecurityEvent[] = [];
    for (const attachment of attachmentTexts) {
      const injection = detectPromptInjection(attachment.text);
      if (injection.detected) recordJarvisSecurityEvent(securityEvents, {
        timestamp: new Date().toISOString(), requestId, conversationId: parsed.data.conversationId,
        event: 'untrusted_content_detected', code: 'PROMPT_INJECTION_SIGNAL', subject: 'attachment', details: { indicatorCount: injection.indicators.length },
      });
    }
    const orchestration = createJarvisOrchestrationTrace(randomUUID(), parsed.data.message, process.env.JARVIS_MODEL || 'gpt-5-mini');
    const memoryService = new JarvisMemoryService();
    const userId = `authenticated:${role}`;
    const memoryScope = { organizationId: security.organizationId, userId, sessionId: parsed.data.conversationId };
    const forgetKey = explicitForgetPreferenceKey(parsed.data.message);
    let memoryCandidateResult: { action: 'stored' | 'rejected' | 'forgotten'; key?: string; reason?: string } | undefined;
    if (forgetKey && process.env.JARVIS_MEMORY_WRITE_ENABLED !== 'false') {
      try {
        await memoryService.forget({ organizationId: memoryScope.organizationId, userId, memoryType: 'user_preference', key: forgetKey });
        memoryCandidateResult = { action: 'forgotten', key: forgetKey };
      } catch (error) {
        memoryCandidateResult = { action: 'rejected', key: forgetKey, reason: 'storage_unavailable' };
        console.warn('[jarvis.memory]', JSON.stringify({ event: 'forget_unavailable', requestId, key: forgetKey, error: error instanceof Error ? error.message : 'unknown' }));
      }
    } else if (forgetKey) {
      memoryCandidateResult = { action: 'rejected', key: forgetKey, reason: 'memory_writes_disabled' };
    }
    let relevantMemories: JarvisMemory[] = [];
    try {
      relevantMemories = await memoryService.retrieveRelevant({ ...memoryScope, role, domains: orchestration.profile.domains, request: parsed.data.message });
    } catch (error) {
      console.warn('[jarvis.memory]', JSON.stringify({ event: 'retrieval_unavailable', requestId, error: error instanceof Error ? error.message : 'unknown' }));
    }
    let relevantKnowledge: KnowledgeSearchResult[] = [];
    if (needsKnowledgeRetrieval(parsed.data.message) && process.env.JARVIS_RAG_ENABLED !== 'false') {
      try {
        const knowledge = await new JarvisKnowledgeService().search({ organizationId: memoryScope.organizationId, role, query: parsed.data.message, limit: 4 });
        relevantKnowledge = knowledge.results;
        console.info('[jarvis.knowledge]', JSON.stringify({ event: 'retrieved', requestId, count: knowledge.results.length, latencyMs: knowledge.diagnostics.latencyMs }));
      } catch (error) {
        console.warn('[jarvis.knowledge]', JSON.stringify({ event: 'retrieval_unavailable', requestId, error: error instanceof Error ? error.message : 'unknown' }));
      }
    }
    const result = await runJarvis({
      message,
      history: parsed.data.history,
      context: {
        role,
        security,
        conversationId: parsed.data.conversationId,
        requestId,
        cache: new Map<string, unknown>(),
        toolAudit: [],
        orchestration,
        contextPackage: buildJarvisContextPackage({
          role,
          profile: orchestration.profile,
          history: parsed.data.history,
          memories: relevantMemories,
          knowledge: relevantKnowledge,
          workflow:
            parsed.data.pendingAction?.type === 'create_so' && parsed.data.pendingAction.previewShown
              ? {
                  type: 'sales_order',
                  state: 'WAITING_FOR_APPROVAL',
                  approvalId: parsed.data.pendingAction.data.approval_id,
                }
              : undefined,
        }),
        toolSignatures: new Map<string, number>(),
        workingMemory: new Map<string, unknown>(),
        memoryObservation: { queriedIds: relevantMemories.map(memory => memory.id), candidate: memoryCandidateResult },
        securityEvents,
      },
    });

    const candidate = process.env.JARVIS_MEMORY_WRITE_ENABLED !== 'false'
      ? explicitPreferenceCandidate({ message: parsed.data.message, role, ...memoryScope })
      : null;
    if (candidate) {
      try {
        const stored = await memoryService.store(candidate);
        result.memoryObservation.candidate = stored.memory
          ? { action: 'stored', key: candidate.key }
          : { action: 'rejected', key: candidate.key, reason: stored.rejected };
      } catch (error) {
        result.memoryObservation.candidate = { action: 'rejected', key: candidate.key, reason: 'storage_unavailable' };
        console.warn('[jarvis.memory]', JSON.stringify({ event: 'candidate_storage_unavailable', requestId, key: candidate.key, error: error instanceof Error ? error.message : 'unknown' }));
      }
    }

    const activitySummary = result.toolActivity.length
      ? `\n\n${result.toolActivity.map(activity => `✓ ${activity.name}`).join('\n')}`
      : '';

    if (result.actionPreview) {
      return NextResponse.json({
        message: `${result.message}${activitySummary}`,
        type: 'so_preview',
        metadata: {
          intent: 'create_so',
          previewData: { ...result.actionPreview.preview, approval_id: result.actionPreview.approval_id },
          debugInfo: { toolActivity: result.toolActivity },
        },
      });
    }

    return NextResponse.json({
      message: `${result.message}${activitySummary}`,
      type: 'text',
      metadata: {
        intent: 'jarvis_agent',
        debugInfo: { toolActivity: result.toolActivity },
      },
    });
  } catch (error) {
    const requestId = randomUUID();
    console.error('[jarvis] request failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({
      message: `JARVIS could not complete that request. No business record was changed. Reference: ${requestId}`,
      type: 'error',
      error: 'JARVIS_RUN_FAILED',
    }, { status: 502 });
  }
}
