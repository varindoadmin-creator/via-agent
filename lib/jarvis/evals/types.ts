import type { Role } from '@/lib/auth';

export const JARVIS_EVAL_CATEGORIES = ['lookup', 'analytics', 'ambiguity', 'sales_order', 'approval', 'permission', 'knowledge', 'memory', 'safety', 'regression', 'efficiency'] as const;
export type JarvisEvalCategory = typeof JARVIS_EVAL_CATEGORIES[number];
export type JarvisEvalOutcome = 'PASS' | 'PARTIAL' | 'FAIL';
export type JarvisEvalFailureReason = 'INTENT_ERROR' | 'TOOL_SELECTION_ERROR' | 'TOOL_DATA_ERROR' | 'CONTEXT_ERROR' | 'RAG_RETRIEVAL_ERROR' | 'MEMORY_ERROR' | 'REASONING_ERROR' | 'CALCULATION_ERROR' | 'PERMISSION_ERROR' | 'APPROVAL_ERROR' | 'HALLUCINATION' | 'RESPONSE_QUALITY';

export interface JarvisEvalCase {
  id: string;
  name: string;
  category: JarvisEvalCategory;
  suites: Array<'golden' | 'safety' | 'rag' | 'memory' | 'regression' | 'behavior' | 'full'>;
  input: { userMessage: string; role?: Role; workflowState?: 'WAITING_FOR_APPROVAL'; fixtures?: string[] };
  expectations: {
    requiredTools?: string[]; allowedTools?: string[]; forbiddenTools?: string[];
    requiredKnowledgeSources?: string[]; forbiddenKnowledgeSources?: string[];
    mustRequireApproval?: boolean; mustNotWrite?: boolean; expectedFacts?: string[];
    forbiddenClaims?: string[]; expectedOutcome?: string;
  };
  critical?: boolean;
  regressionOf?: string;
}

export interface JarvisEvalObservation {
  toolsCalled: string[];
  sourcesUsed: string[];
  finalAnswer: string;
  approvalRequested: boolean;
  writeAttempted: boolean;
  facts: string[];
  forbiddenClaims?: string[];
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  promptVersion?: string;
  toolRegistryVersion?: string;
  knowledgeIndexVersion?: string;
  errors?: string[];
}

export interface JarvisEvalResult {
  evalRunId: string; caseId: string; name: string; category: JarvisEvalCategory; passed: boolean; outcome: JarvisEvalOutcome;
  scores: { factualAccuracy: JarvisEvalOutcome; toolSelection: JarvisEvalOutcome; grounding: JarvisEvalOutcome; policyCompliance: JarvisEvalOutcome; safety: JarvisEvalOutcome; taskCompletion: JarvisEvalOutcome; efficiency: JarvisEvalOutcome };
  toolsCalled: string[]; sourcesUsed: string[]; finalAnswer: string; failureReasons: JarvisEvalFailureReason[];
  criticalFailure: boolean; durationMs: number; tokenUsage?: { input?: number; output?: number }; estimatedCostUsd?: number;
}

export interface JarvisEvalReport { runId: string; suite: string; datasetVersion: string; applicationVersion: string; results: JarvisEvalResult[]; summary: { total: number; passed: number; partial: number; failed: number; criticalFailures: number; averageToolCalls: number; averageLatencyMs: number; estimatedCostUsd: number }; }

export interface JarvisEvalExecutor {
  execute(evalCase: JarvisEvalCase): Promise<JarvisEvalObservation>;
}
