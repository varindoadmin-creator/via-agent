/** Stable, synthetic facts. Eval execution must never query or change Zoho Books. */
export const JARVIS_EVAL_FIXTURES = {
  inventory: { DWE9004L: { itemId: 'item-dwe9004l', quantity: 42, hubs: ['HEAD OFFICE: 30', 'HUB-BDG: 12'] } },
  customers: ['PT ABC Trading', 'PT ABC Interior', 'ABC Surabaya'],
  sales: { customerAbc: { january: 100_000_000, february: 60_000_000 }, total: { current: 85_000_000, previous: 100_000_000 } },
  pricing: { DWE9004L: { memory: 100, live: 120 } },
  knowledge: { salesOrderSop: { title: 'Sales Order SOP', version: 'v3', section: '4. Approval', status: 'ACTIVE' }, missingPolicy: null },
  roles: { director: ['read', 'analyze', 'prepare'], admin: [] },
} as const;

export const EVAL_DATASET_VERSION = 'jarvis-evals-v1';
