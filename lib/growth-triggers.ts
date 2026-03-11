/**
 * Growth Trigger Engine
 *
 * Transforms computed KPIs into actionable business insights (triggers).
 * Pure backend logic — no DB writes, no UI, no cron.
 *
 * Architecture:
 *   evaluateRestaurantGrowth(restaurantId)
 *     ├─ computeRestaurantKPIs()   → ComputedKpi[] (values + statuses)
 *     ├─ getRestaurantKPIs()       → planKey + settings (context)
 *     └─ RULES[]                  → evaluated in sequence, each returns Trigger | null
 *
 * Adding a new trigger:
 *   1. Write a pure RuleFn in the "Rules" section
 *   2. Register it in RULES[] at the bottom — nothing else to change
 *
 * Contracts:
 *   - Rules are pure functions; they never throw, never write to DB
 *   - A rule that errors is caught and skipped — it does not abort the pipeline
 *   - Rules receive a KpiMap (keyed by kpi.key) — absent key = KPI not enabled for this plan
 *   - Rules should return null when their condition is not met
 */

import { computeRestaurantKPIs, type ComputedKpi } from '@/lib/kpi-calculators';
import { getRestaurantKPIs } from '@/lib/kpi-engine';

/* ── Public types ───────────────────────────────────────────────────────────── */

export interface Trigger {
  key:             string;
  type:           'upgrade' | 'risk' | 'opportunity';
  severity:       'low' | 'medium' | 'high';
  title:          string;
  message:        string;
  suggested_plan?: string;
}

/* ── Internal rule infrastructure ──────────────────────────────────────────── */

/** KPI values keyed by kpi.key. A missing key means the KPI is not enabled for this plan. */
type KpiMap = Record<string, ComputedKpi>;

interface TriggerContext {
  planKey:     string;
  settings:    Record<string, string>;
  /** Set of KPI keys that were computed (i.e. enabled for this restaurant's plan) */
  enabledKeys: Set<string>;
}

type TriggerPayload = Omit<Trigger, 'key'>;

type RuleFn = (kpis: KpiMap, ctx: TriggerContext) => TriggerPayload | null;

interface RuleDefinition {
  id: string;
  fn: RuleFn;
}

/* ── Accessor helpers ───────────────────────────────────────────────────────── */

/** Numeric value of a KPI, or 0 if not enabled / not computed */
function val(kpis: KpiMap, key: string): number {
  return kpis[key]?.result.value ?? 0;
}

/** Status of a KPI, or undefined if not present */
function status(kpis: KpiMap, key: string): 'good' | 'warning' | 'critical' | undefined {
  return kpis[key]?.result.status;
}

/** true when a KPI is present in the result set (enabled for this plan) */
function enabled(kpis: KpiMap, key: string): boolean {
  return key in kpis;
}

/* ═══════════════════════════════════════════════════════════════════════════
   RULES
   Each rule is a self-contained function. Return Trigger to fire, null to skip.
═══════════════════════════════════════════════════════════════════════════ */

/* ── Risk: retention ────────────────────────────────────────────────────────── */

const ruleChurnRiskHigh: RuleFn = (kpis) => {
  if (status(kpis, 'retention_rate_90d') !== 'critical') return null;
  const rate = val(kpis, 'retention_rate_90d');
  return {
    type:     'risk',
    severity: 'high',
    title:    'Risque de churn élevé',
    message:  `Seulement ${rate}% de vos clients ont effectué 2 visites ou plus en 90 jours. Une campagne de réactivation est urgente.`,
  };
};

const ruleChurnRiskMedium: RuleFn = (kpis) => {
  if (status(kpis, 'retention_rate_90d') !== 'warning') return null;
  const rate = val(kpis, 'retention_rate_90d');
  return {
    type:     'risk',
    severity: 'medium',
    title:    'Rétention à surveiller',
    message:  `${rate}% de rétention à 90 jours — en dessous du seuil cible de 70%. Pensez à encourager la 2ème visite.`,
  };
};

/* ── Risk: inactive majority ────────────────────────────────────────────────── */

const ruleInactiveMajority: RuleFn = (kpis) => {
  const churn = val(kpis, 'churn_rate_30d');
  if (!enabled(kpis, 'churn_rate_30d') || churn <= 50) return null;
  return {
    type:     'risk',
    severity: 'high',
    title:    'Majorité de clients inactifs',
    message:  `${churn}% de vos clients n'ont pas visité depuis 30 jours. Votre base client se désengage activement.`,
  };
};

/* ── Risk: engagement drop ──────────────────────────────────────────────────── */

const ruleEngagementDrop: RuleFn = (kpis) => {
  if (status(kpis, 'scans_per_customer') !== 'critical') return null;
  const scansPerCust = val(kpis, 'scans_per_customer');
  return {
    type:     'risk',
    severity: 'high',
    title:    'Engagement en chute libre',
    message:  `Moyenne de ${scansPerCust} scan(s) par client actif — le programme de fidélité ne génère pas de visites répétées.`,
  };
};

/* ── Risk: growth stalled ───────────────────────────────────────────────────── */

const ruleGrowthStalled: RuleFn = (kpis) => {
  if (!enabled(kpis, 'new_customers_30d')) return null;
  const newCust   = val(kpis, 'new_customers_30d');
  const totalCust = val(kpis, 'total_customers');
  if (newCust > 0 || totalCust === 0) return null;
  return {
    type:     'risk',
    severity: 'medium',
    title:    'Aucune nouvelle inscription ce mois',
    message:  `Votre lien d'inscription n'a généré aucun nouveau client en 30 jours. Partagez-le sur vos réseaux ou sur vos tables.`,
  };
};

/* ── Opportunity: re-engagement campaign ────────────────────────────────────── */

const ruleReEngagement: RuleFn = (kpis) => {
  const churn = val(kpis, 'churn_rate_30d');
  // Only trigger in the 40–50% band; above 50% the "majority inactive" risk fires instead
  if (!enabled(kpis, 'churn_rate_30d') || churn <= 40 || churn > 50) return null;
  return {
    type:     'opportunity',
    severity: 'medium',
    title:    'Opportunité de réactivation',
    message:  `${churn}% de clients inactifs depuis 30 jours. Une campagne email ciblée pourrait en récupérer une partie significative.`,
  };
};

/* ── Opportunity: campaign underused ────────────────────────────────────────── */

const ruleCampaignUnderused: RuleFn = (kpis, ctx) => {
  if (!enabled(kpis, 'campaign_reach')) return null;
  if (status(kpis, 'campaign_reach') === 'good') return null;
  const totalCust = val(kpis, 'total_customers');
  // Only meaningful once there is a substantial customer base
  if (totalCust < 20) return null;
  // Suppress if plan does not include email campaigns (feature not available)
  if (!ctx.enabledKeys.has('campaign_reach')) return null;
  return {
    type:     'opportunity',
    severity: 'medium',
    title:    'Campagnes email sous-utilisées',
    message:  `Moins de 20% de votre base client a été contactée par email. Les campagnes de fidélisation augmentent en moyenne la fréquence de visite de 15%.`,
  };
};

/* ── Opportunity: low wallet adoption (any plan) ────────────────────────────── */

const ruleLowWalletAdoption: RuleFn = (kpis, ctx) => {
  if (!enabled(kpis, 'wallet_pass_rate')) return null;
  const rate      = val(kpis, 'wallet_pass_rate');
  const totalCust = val(kpis, 'total_customers');
  if (rate >= 30 || totalCust < 10) return null;
  // On free plan this becomes an upgrade trigger (handled separately)
  if (ctx.planKey === 'starter') return null;
  return {
    type:     'opportunity',
    severity: 'medium',
    title:    'Adoption Wallet faible',
    message:  `${rate}% de vos clients ont un pass Wallet actif. Affichez le QR d'installation en caisse pour augmenter ce taux.`,
  };
};

/* ── Opportunity: missing average_ticket setting ────────────────────────────── */

const ruleMissingAvgTicket: RuleFn = (kpis, ctx) => {
  // Only relevant when at least one revenue KPI is enabled
  const hasRevenueKpi = ['revenue_estimate', 'revenue_per_customer', 'ltv_estimate']
    .some((k) => enabled(kpis, k));
  if (!hasRevenueKpi) return null;
  const ticket = parseFloat(ctx.settings['average_ticket'] ?? '0');
  if (ticket > 0) return null;
  return {
    type:     'opportunity',
    severity: 'low',
    title:    'Ticket moyen non configuré',
    message:  'Renseignez votre ticket moyen dans les Paramètres → Analytiques pour débloquer les KPIs de revenus estimés (CA, LTV, CA par client).',
  };
};

/* ── Opportunity: no rewards ever issued ────────────────────────────────────── */

const ruleNoRewardsIssued: RuleFn = (kpis) => {
  if (!enabled(kpis, 'rewards_issued')) return null;
  const rewards    = val(kpis, 'rewards_issued');
  const totalScans = val(kpis, 'total_scans');
  // Only fire when scans exist but no rewards have triggered yet
  if (rewards > 0 || totalScans < 10) return null;
  return {
    type:     'opportunity',
    severity: 'medium',
    title:    'Aucune récompense déclenchée',
    message:  `${totalScans} scans effectués mais 0 récompense émise. Vérifiez que le seuil de fidélité est adapté à votre fréquence de visite.`,
  };
};

/* ── Opportunity: positive growth momentum ──────────────────────────────────── */

const ruleGrowthMomentum: RuleFn = (kpis) => {
  if (!enabled(kpis, 'new_customers_30d')) return null;
  const t = kpis['new_customers_30d']?.result.trend;
  if (t === undefined || t < 25) return null;
  return {
    type:     'opportunity',
    severity: 'low',
    title:    'Accélération de la croissance',
    message:  `+${t}% de nouveaux clients vs le mois précédent. C'est le bon moment pour renforcer votre programme de fidélité et capitaliser sur cet élan.`,
  };
};

/* ── Upgrade: wallet feature locked on free plan ────────────────────────────── */

const ruleWalletUpgrade: RuleFn = (kpis, ctx) => {
  if (ctx.planKey !== 'starter') return null;
  const totalCust = val(kpis, 'total_customers');
  if (totalCust < 10) return null;
  // Wallet KPI not computed = feature not accessible on this plan
  const walletNotEnabled = !enabled(kpis, 'wallet_pass_rate');
  // Or wallet is accessible but adoption is low (plan override)
  const walletLow = enabled(kpis, 'wallet_pass_rate') && val(kpis, 'wallet_pass_rate') < 30;
  if (!walletNotEnabled && !walletLow) return null;
  return {
    type:           'upgrade',
    severity:       'medium',
    title:          'Débloquez Google & Apple Wallet',
    message:        `Avec ${totalCust} clients inscrits, l'envoi automatique de passes Wallet augmenterait significativement la fidélisation. Disponible dès le plan Pro.`,
    suggested_plan: 'pro',
  };
};

/* ── Upgrade: analytics locked on starter plan ────────────────────────────────── */

const ruleAnalyticsUpgrade: RuleFn = (kpis, ctx) => {
  if (ctx.planKey !== 'starter') return null;
  if (enabled(kpis, 'retention_rate_90d') && enabled(kpis, 'churn_rate_30d')) return null;
  const totalCust = val(kpis, 'total_customers');
  if (totalCust < 30) return null;
  return {
    type:           'upgrade',
    severity:       'low',
    title:          'Analytics avancés disponibles en Pro',
    message:        `Avec ${totalCust} clients, les KPIs de rétention, churn et LTV vous donneraient une vision actionnable de votre fidélisation.`,
    suggested_plan: 'pro',
  };
};

/* ── Upgrade: revenue KPIs locked but ticket is configured ──────────────────── */

const ruleRevenueKpisLocked: RuleFn = (kpis, ctx) => {
  if (ctx.planKey !== 'starter') return null;
  if (enabled(kpis, 'revenue_estimate')) return null;
  const ticket = parseFloat(ctx.settings['average_ticket'] ?? '0');
  if (ticket <= 0) return null;
  return {
    type:           'upgrade',
    severity:       'medium',
    title:          'Estimation de revenus verrouillée',
    message:        `Votre ticket moyen est configuré (${ticket}€) mais les KPIs de CA et LTV sont réservés au plan Pro.`,
    suggested_plan: 'pro',
  };
};

/* ── Upgrade: high visit frequency on free — LTV potential visible ───────────── */

const ruleLtvUpgrade: RuleFn = (kpis, ctx) => {
  if (ctx.planKey !== 'starter') return null;
  if (!enabled(kpis, 'avg_days_between_visits')) return null;
  const freq = val(kpis, 'avg_days_between_visits');
  // Frequent visits + no LTV = missed revenue insight
  if (freq <= 0 || freq > 14) return null;
  return {
    type:           'upgrade',
    severity:       'low',
    title:          'LTV estimée disponible en Pro',
    message:        `Vos clients reviennent tous les ${freq} jours en moyenne. Passez en Pro pour calculer leur valeur vie (LTV) et optimiser votre stratégie tarifaire.`,
    suggested_plan: 'pro',
  };
};

/* ═══════════════════════════════════════════════════════════════════════════
   RULE REGISTRY
   Evaluation order matters: risks → opportunities → upgrades.
   Within each category, higher-severity rules come first.
═══════════════════════════════════════════════════════════════════════════ */

const RULES: RuleDefinition[] = [
  // Risks — high severity first
  { id: 'churn_risk_high',      fn: ruleChurnRiskHigh      },
  { id: 'inactive_majority',    fn: ruleInactiveMajority   },
  { id: 'engagement_drop',      fn: ruleEngagementDrop     },
  { id: 'churn_risk_medium',    fn: ruleChurnRiskMedium    },
  { id: 'growth_stalled',       fn: ruleGrowthStalled      },

  // Opportunities
  { id: 're_engagement',        fn: ruleReEngagement       },
  { id: 'campaign_underused',   fn: ruleCampaignUnderused  },
  { id: 'no_rewards_issued',    fn: ruleNoRewardsIssued    },
  { id: 'low_wallet_adoption',  fn: ruleLowWalletAdoption  },
  { id: 'missing_avg_ticket',   fn: ruleMissingAvgTicket   },
  { id: 'growth_momentum',      fn: ruleGrowthMomentum     },

  // Upgrades — medium before low
  { id: 'wallet_upgrade',       fn: ruleWalletUpgrade      },
  { id: 'revenue_kpis_locked',  fn: ruleRevenueKpisLocked  },
  { id: 'analytics_upgrade',    fn: ruleAnalyticsUpgrade   },
  { id: 'ltv_upgrade',          fn: ruleLtvUpgrade         },
];

/* ── Orchestrator ───────────────────────────────────────────────────────────── */

/**
 * evaluateRestaurantGrowth(restaurantId)
 *
 * 1. Fetches KPI context (plan, settings) and computed KPI values in parallel
 * 2. Builds a KpiMap keyed by kpi.key and a TriggerContext
 * 3. Evaluates every registered rule, collecting non-null results
 * 4. Returns triggers sorted by severity (high → medium → low)
 */
export async function evaluateRestaurantGrowth(restaurantId: string): Promise<Trigger[]> {
  // Parallel: context (plan + settings) + computed KPI values
  const [kpiContext, computedKpis] = await Promise.all([
    getRestaurantKPIs(restaurantId),
    computeRestaurantKPIs(restaurantId),
  ]);

  // Build lookup map
  const kpiMap: KpiMap = Object.fromEntries(
    computedKpis.map((k) => [k.key, k])
  );

  const ctx: TriggerContext = {
    planKey:     kpiContext.planKey,
    settings:    kpiContext.settings,
    enabledKeys: new Set(computedKpis.map((k) => k.key)),
  };

  // Evaluate all rules, isolating failures
  const triggers: Trigger[] = [];
  for (const { id, fn } of RULES) {
    try {
      const result = fn(kpiMap, ctx);
      if (result !== null) triggers.push({ ...result, key: id });
    } catch (err) {
      // A broken rule must never abort the pipeline
      console.error(`[growth-triggers] rule "${id}" threw:`, err);
    }
  }

  // Sort: high → medium → low
  const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
  triggers.sort((a, b) =>
    (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)
  );

  return triggers;
}
