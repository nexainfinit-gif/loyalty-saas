/**
 * Canonical KPI key catalog.
 * Matches the seed data in migration 006_kpi_engine.sql.
 * Keys are stable identifiers — never rename a key once data exists.
 *
 * Unknown keys typed in the admin UI are stored in `kpis` and resolved
 * at runtime without any code change here.
 */
export const KPI_CATALOG = [
  { key: 'total_customers',         name: 'Total clients',              category: 'growth'      },
  { key: 'new_customers_30d',       name: 'Nouveaux clients (30j)',     category: 'growth'      },
  { key: 'active_customers_30d',    name: 'Clients actifs (30j)',       category: 'retention'   },
  { key: 'churn_rate_30d',          name: 'Taux de churn (30j)',        category: 'retention'   },
  { key: 'retention_rate_90d',      name: 'Rétention 90 jours',        category: 'retention'   },
  { key: 'total_scans',             name: 'Total scans',                category: 'engagement'  },
  { key: 'scans_per_customer',      name: 'Scans par client',           category: 'engagement'  },
  { key: 'rewards_issued',          name: 'Récompenses déclenchées',   category: 'engagement'  },
  { key: 'avg_days_between_visits', name: 'Fréquence visite (jours)',  category: 'retention'   },
  { key: 'wallet_pass_rate',        name: 'Taux adoption Wallet',       category: 'engagement'  },
  { key: 'revenue_estimate',        name: 'CA estimé (période)',        category: 'revenue'     },
  { key: 'revenue_per_customer',    name: 'CA par client',              category: 'revenue'     },
  { key: 'avg_ticket',              name: 'Ticket moyen',               category: 'revenue'     },
  { key: 'ltv_estimate',            name: 'LTV estimée',                category: 'revenue'     },
  { key: 'campaign_reach',          name: 'Portée campagnes email',     category: 'growth'      },
] as const satisfies ReadonlyArray<{ key: string; name: string; category: string }>;

export type KpiKey = typeof KPI_CATALOG[number]['key'];

export type KpiCategory = 'growth' | 'retention' | 'revenue' | 'engagement';

/** KPI keys that require a restaurant_settings value to be computable. */
export const KPI_REQUIRED_SETTINGS: Partial<Record<KpiKey, string[]>> = {
  revenue_estimate:    ['average_ticket'],
  revenue_per_customer:['average_ticket'],
  ltv_estimate:        ['average_ticket'],
};

/** Human labels for restaurant_settings keys shown in the dashboard. */
export const RESTAURANT_SETTING_LABELS: Record<string, { label: string; description: string; unit?: string }> = {
  average_ticket: {
    label:       'Ticket moyen',
    description: "Valeur moyenne d'une transaction client (utilisé pour estimer le CA)",
    unit:        '€',
  },
};
