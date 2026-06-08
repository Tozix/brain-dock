export type Intent = 'debug' | 'modify' | 'refactor' | 'explore';

export interface IntentAnalysis {
  intent: Intent;
  /** Additive score boosts applied per symbol role during re-ranking. */
  roleBoosts: Record<string, number>;
}

const PATTERNS: Array<{ intent: Intent; re: RegExp }> = [
  {
    intent: 'debug',
    re: /\b(bug|error|fix|fails?|failing|crash|throws?|exception|broken|stack|trace|why)\b/i,
  },
  {
    intent: 'refactor',
    re: /\b(refactor|rename|cleanup|clean up|simplify|extract|restructure|dedupe|deduplicate)\b/i,
  },
  {
    intent: 'modify',
    re: /\b(add|implement|create|change|update|support|feature|wire|introduce)\b/i,
  },
  {
    intent: 'explore',
    re: /\b(how|what|where|explain|understand|overview|architecture|flow|structure)\b/i,
  },
];

const ROLE_BOOSTS: Record<Intent, Record<string, number>> = {
  debug: { service: 0.3, controller: 0.2, guard: 0.15, pipe: 0.1 },
  modify: { service: 0.2, controller: 0.2, module: 0.1, dto: 0.1 },
  refactor: { service: 0.2, repository: 0.2, class: 0.1 },
  explore: { module: 0.3, controller: 0.2, service: 0.1 },
};

/** Heuristic intent classifier. Defaults to `explore` when nothing matches. */
export function detectIntent(query: string): IntentAnalysis {
  const intent = PATTERNS.find((p) => p.re.test(query))?.intent ?? 'explore';
  return { intent, roleBoosts: ROLE_BOOSTS[intent] };
}
