export const PLAN_FEATURE_KEYS = [
  { key: 'wallet_studio',   label: 'Google & Apple Wallet' },
  { key: 'campaigns_email', label: 'Campagnes email' },
  { key: 'analytics',       label: 'Analytics avancés' },
  { key: 'export_csv',      label: 'Export CSV clients' },
  { key: 'scanner_staff',   label: 'Scanner caissier' },
] as const satisfies ReadonlyArray<{ key: string; label: string }>;

export type FeatureKey = typeof PLAN_FEATURE_KEYS[number]['key'];
