'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { CompactLocaleSwitcher } from '@/components/LocaleSwitcher';

export default function Home() {
  const { t } = useTranslation();
  const [data, setData] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      const { data: result, error: err } = await supabase
        .from('restaurants')
        .select('*');
      if (err) {
        setError(err.message);
      } else {
        setData(result);
      }
    }
    fetchData();
  }, []);

  if (error) {
    return <div>{t('common.error')} : {error}</div>;
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div className="flex justify-end mb-4">
        <CompactLocaleSwitcher />
      </div>
      <h1>{t('common.success')}</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
