import './theme.css';
import DesignV2Shell from '@/components/ui-v2/DesignV2Shell';
import type { ReactNode } from 'react';

/**
 * Layout du bac à sable Design v2 (« Comptoir »).
 * Charge les tokens scopés et enveloppe dans le shell (thème clair/sombre).
 * ISOLÉ : n'affecte aucune page existante.
 */
export default function DesignV2Layout({ children }: { children: ReactNode }) {
  return <DesignV2Shell>{children}</DesignV2Shell>;
}
