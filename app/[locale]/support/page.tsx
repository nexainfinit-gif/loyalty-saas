'use client';

import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import { CompactLocaleSwitcher } from '@/components/LocaleSwitcher';

/* ─── Page ────────────────────────────────────────────────── */
export default function SupportPage() {
  const { t, locale } = useTranslation();

  const faqs = [
    { q: t('support.faq1q'), a: t('support.faq1a') },
    { q: t('support.faq2q'), a: t('support.faq2a') },
    { q: t('support.faq3q'), a: t('support.faq3a') },
    { q: t('support.faq4q'), a: t('support.faq4a') },
    { q: t('support.faq5q'), a: t('support.faq5a') },
    { q: t('support.faq6q'), a: t('support.faq6a') },
  ];

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-start justify-between">
            <div className="flex-1">
          <Link
            href={`/${locale}/dashboard`}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t('support.backToDashboard')}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{t('support.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('support.subtitle')}
          </p>
            </div>
            <CompactLocaleSwitcher />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8 flex flex-col gap-8">
        {/* ── Contact card ─────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('support.contactTitle')}</h2>
          <p className="text-sm text-gray-500 mb-4">
            {t('support.contactDesc')}
          </p>
          <a
            href="mailto:support@rebites.be"
            className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            support@rebites.be
          </a>
        </section>

        {/* ── FAQ ───────────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('support.faqTitle')}</h2>
          <div className="flex flex-col gap-4">
            {faqs.map((faq, i) => (
              <details
                key={i}
                className="group bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
              >
                <summary className="flex items-center justify-between gap-4 px-6 py-4 cursor-pointer list-none select-none text-sm font-semibold text-gray-900 hover:bg-gray-50 transition-colors">
                  <span>{faq.q}</span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="flex-shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </summary>
                <div className="px-6 pb-4 text-sm text-gray-600 leading-relaxed">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* ── Footer note ──────────────────────────────── */}
        <p className="text-xs text-gray-400 text-center pb-4">
          {t('support.footer')}
        </p>
      </main>
    </div>
  );
}
