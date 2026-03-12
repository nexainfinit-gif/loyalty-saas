'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from '@/lib/i18n';

interface ReferralShareCardProps {
  referralCode: string;
  restaurantSlug: string;
  restaurantName: string;
  restaurantColor?: string;
  rewardAmount?: number;
  programType?: 'points' | 'stamps';
  locale: string;
}

export default function ReferralShareCard({
  referralCode,
  restaurantSlug,
  restaurantName,
  restaurantColor = '#4f6bed',
  rewardAmount,
  programType = 'points',
  locale,
}: ReferralShareCardProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const appUrl = typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL ?? '';

  const referralLink = `${appUrl}/${locale}/register/${restaurantSlug}?ref=${referralCode}`;

  const rewardLabel = rewardAmount
    ? programType === 'stamps'
      ? t('referral.rewardStamps', { amount: String(rewardAmount) })
      : t('referral.rewardPoints', { amount: String(rewardAmount) })
    : null;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = referralLink;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [referralLink]);

  const handleShare = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: t('referral.shareTitle', { restaurant: restaurantName }),
          text: t('referral.shareText', { restaurant: restaurantName }),
          url: referralLink,
        });
      } catch {
        // User cancelled or share failed — fall back to copy
        handleCopy();
      }
    } else {
      handleCopy();
    }
  }, [referralLink, restaurantName, t, handleCopy]);

  const supportsShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.03)]">
      {/* Header icon + title */}
      <div className="mb-3 flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${restaurantColor}15` }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke={restaurantColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-gray-900">
          {t('referral.title')}
        </h3>
      </div>

      {/* Description */}
      <p className="mb-3 text-xs leading-relaxed text-gray-500">
        {t('referral.description', { restaurant: restaurantName })}
      </p>

      {/* Reward badge */}
      {rewardLabel && (
        <div
          className="mb-3 rounded-xl px-3 py-2 text-center text-xs font-semibold"
          style={{
            backgroundColor: `${restaurantColor}10`,
            color: restaurantColor,
          }}
        >
          {rewardLabel}
        </div>
      )}

      {/* Referral link display */}
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-xs text-gray-600">
          {referralLink}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {/* Copy button */}
        <button
          type="button"
          onClick={handleCopy}
          className={[
            'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5',
            'text-sm font-semibold transition-all duration-200',
            copied
              ? 'bg-success-50 text-success-700'
              : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
          ].join(' ')}
        >
          {copied ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {t('referral.copied')}
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {t('referral.copyLink')}
            </>
          )}
        </button>

        {/* Share button (mobile) */}
        {supportsShare && (
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90"
            style={{ backgroundColor: restaurantColor }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            {t('referral.share')}
          </button>
        )}
      </div>
    </div>
  );
}
