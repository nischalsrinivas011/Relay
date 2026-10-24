// Aggregates recurring implementation problems across synthetic customers into
// roadmap evidence. Acme's observations come from live state; the other three
// customers are fixed synthetic engagements.

export interface Observation {
  customer: string;
  issue: IssueKey;
  manualSteps: number;
  blockers: number;
}

export type IssueKey = "legal_entity" | "country_tax_fields" | "bulk_prevalidation" | "webhook_replay" | "auth_scope" | "regional_address";

export const ISSUES: Record<IssueKey, { title: string; recommendation: string; problem: string }> = {
  legal_entity: {
    title: "Legal-entity configuration",
    problem: "Workers are mapped and validated before anyone confirms their legal entity can run payroll, so blockers surface late.",
    recommendation: "Expose legal-entity eligibility earlier, in implementation discovery.",
  },
  country_tax_fields: {
    title: "Country-specific tax fields",
    problem: "Required tax fields differ by country and are usually missing or mis-shaped in the source HRIS.",
    recommendation: "Publish country tax-field presets with source-side validation the customer can run themselves.",
  },
  bulk_prevalidation: {
    title: "Bulk pre-validation",
    problem: "Customers want to validate a whole population before any create call, and build it themselves each time.",
    recommendation: "Offer a dry-run validation endpoint that accepts a batch and returns per-record schema errors.",
  },
  webhook_replay: {
    title: "Webhook replay",
    problem: "Failed deliveries are replayed by hand from support tooling.",
    recommendation: "Self-serve replay with filters, plus automatic retry for transient receiver errors.",
  },
  auth_scope: {
    title: "Authentication scope errors",
    problem: "Tokens are minted without the scope an endpoint needs; the 403 does not say which scope is missing.",
    recommendation: "Return the missing scope in 403 responses and list scopes per endpoint in the token UI.",
  },
  regional_address: {
    title: "Regional address fields",
    problem: "States, provinces and counties live in different source fields per country.",
    recommendation: "Ship per-country address mapping presets.",
  },
};

export const OTHER_CUSTOMERS = ["Globex", "Umbrella Corp", "Initech"] as const;

export const SYNTHETIC_OBSERVATIONS: Observation[] = [
  { customer: "Globex", issue: "legal_entity", manualSteps: 4, blockers: 1 },
  { customer: "Umbrella Corp", issue: "legal_entity", manualSteps: 3, blockers: 1 },
  { customer: "Globex", issue: "country_tax_fields", manualSteps: 6, blockers: 0 },
  { customer: "Initech", issue: "country_tax_fields", manualSteps: 5, blockers: 1 },
  { customer: "Globex", issue: "bulk_prevalidation", manualSteps: 8, blockers: 0 },
  { customer: "Umbrella Corp", issue: "bulk_prevalidation", manualSteps: 7, blockers: 0 },
  { customer: "Initech", issue: "bulk_prevalidation", manualSteps: 9, blockers: 0 },
  { customer: "Umbrella Corp", issue: "webhook_replay", manualSteps: 12, blockers: 0 },
  { customer: "Initech", issue: "webhook_replay", manualSteps: 6, blockers: 0 },
  { customer: "Globex", issue: "auth_scope", manualSteps: 2, blockers: 1 },
  { customer: "Initech", issue: "regional_address", manualSteps: 3, blockers: 0 },
];

/** Synthetic support-event and mapping-failure tallies across the four customers. */
export const SYNTHETIC_TALLIES = {
  supportEvents: { total: 211, authScope: 38 },
  mappingFailures: { total: 362, countryTax: 152 },
};

export interface AcmeSignals {
  legalEntityBlocked: boolean;
  legalEntityManualSteps: number;
  taxFieldIssues: number;
  replays: number;
  authFailures: number;
  provinceMapped: boolean;
}

export function acmeObservations(s: AcmeSignals): Observation[] {
  const out: Observation[] = [];
  // Seen at Acme whether or not it has since been fixed: the lesson still counts.
  out.push({ customer: "Acme Global", issue: "legal_entity", manualSteps: s.legalEntityManualSteps, blockers: s.legalEntityBlocked ? 1 : 0 });
  if (s.taxFieldIssues > 0) out.push({ customer: "Acme Global", issue: "country_tax_fields", manualSteps: 3, blockers: 0 });
  out.push({ customer: "Acme Global", issue: "bulk_prevalidation", manualSteps: 2, blockers: 0 });
  if (s.replays > 0) out.push({ customer: "Acme Global", issue: "webhook_replay", manualSteps: s.replays, blockers: 0 });
  if (s.authFailures > 0) out.push({ customer: "Acme Global", issue: "auth_scope", manualSteps: s.authFailures, blockers: 0 });
  out.push({ customer: "Acme Global", issue: "regional_address", manualSteps: s.provinceMapped ? 1 : 2, blockers: s.provinceMapped ? 0 : 1 });
  return out;
}

export interface Insight {
  issue: IssueKey;
  title: string;
  problem: string;
  recommendation: string;
  customers: string[];
  seenIn: number;
  manualSteps: number;
  blockers: number;
}

export function aggregate(observations: Observation[], totalCustomers = 4): Insight[] {
  const by = new Map<IssueKey, Observation[]>();
  for (const o of observations) by.set(o.issue, [...(by.get(o.issue) ?? []), o]);
  return [...by.entries()]
    .map(([issue, list]) => {
      const customers = [...new Set(list.map((o) => o.customer))];
      return {
        issue,
        ...ISSUES[issue],
        customers,
        seenIn: customers.length,
        manualSteps: list.reduce((a, o) => a + o.manualSteps, 0),
        blockers: list.reduce((a, o) => a + o.blockers, 0),
      };
    })
    .filter((x) => x.seenIn >= 2 || totalCustomers < 2)
    // Customer blockers weigh most, then reach across customers, then manual effort.
    .sort((a, b) => rank(b) - rank(a));
}

function rank(i: { seenIn: number; blockers: number; manualSteps: number }) {
  return i.blockers * 3 + i.seenIn * 2 + i.manualSteps / 10;
}

export interface PriorityScores {
  customerImpact: number;
  feasibility: number;
  operationalComplexity: number;
  repeatability: number;
  revenue: number;
}

/** 1-5 inputs. Higher complexity lowers priority. */
export function priorityScore(s: PriorityScores) {
  const v = s.customerImpact * 0.3 + s.repeatability * 0.25 + s.revenue * 0.2 + s.feasibility * 0.15 + (6 - s.operationalComplexity) * 0.1;
  const tier = v >= 4.2 ? "P0" : v >= 3.4 ? "P1" : v >= 2.6 ? "P2" : "P3";
  return { value: Number(v.toFixed(2)), tier };
}

export interface FeedbackRecord {
  id: string;
  title: string;
  problem: string;
  affectedCustomers: string[];
  frequency: string;
  customerImpact: string;
  operationalImpact: string;
  suggestedChange: string;
  evidence: string[];
  scores: PriorityScores;
  priority: { value: number; tier: string };
  createdAt: string;
}
