'use client';
// Public cashier scanner — no Supabase login required.
// Auth is handled by the scanner_token embedded in the URL, sent as
// X-Scanner-Token header on every scan API call.

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import jsQR from 'jsqr';
import { useTranslation } from '@/lib/i18n';

interface ScanAction {
  id: string;
  label: string;
  icon: string | null;
  points_value: number;
  sort_order: number;
}

interface IdentifiedCustomer {
  id: string;
  first_name: string;
  last_name: string;
  total_points: number;
  stamps_count?: number;
}

interface ScanResult {
  program_type: 'points' | 'stamps';
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    total_points: number;
    stamps_count: number;
  };
  points_added: number;
  stamps_added: number;
  stamps_total: number;
  stamp_card_completed: boolean;
  reward_triggered: boolean;
  reward_message: string;
  scan_action_label: string | null;
}

type PageState = 'validating' | 'ready' | 'invalid';
type Status = 'idle' | 'identifying' | 'identified' | 'loading' | 'success' | 'error';

export default function PublicScannerPage() {
  const { scannerToken } = useParams<{ scannerToken: string }>();
  const { t } = useTranslation();

  const [pageState, setPageState]           = useState<PageState>('validating');
  const [restaurantName, setRestaurantName] = useState('');
  const [brandColor, setBrandColor]         = useState('#4f6bed');
  const [manualId, setManualId]             = useState('');
  const [result, setResult]                 = useState<ScanResult | null>(null);
  const [status, setStatus]                 = useState<Status>('idle');
  const [errorMsg, setErrorMsg]             = useState('');
  const [cameraActive, setCameraActive]     = useState(false);
  const [scanActions, setScanActions]       = useState<ScanAction[]>([]);
  const [programType, setProgramType]       = useState<'points' | 'stamps'>('points');
  const [identifiedCustomer, setIdentifiedCustomer] = useState<IdentifiedCustomer | null>(null);
  const [pendingScanToken, setPendingScanToken]       = useState<string>('');

  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Validate scanner token + fetch scan actions on mount ────────────────
  useEffect(() => {
    if (!scannerToken) { setPageState('invalid'); return; }
    fetch(`/api/scanner-info/${encodeURIComponent(scannerToken)}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        setRestaurantName(d.restaurant.name);
        setBrandColor(d.restaurant.primary_color ?? '#4f6bed');
        setScanActions(d.scan_actions ?? []);
        if (d.loyalty_settings?.program_type) setProgramType(d.loyalty_settings.program_type);
        setPageState('ready');
      })
      .catch(() => setPageState('invalid'));

    return () => stopCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerToken]);

  // ── Camera QR scanning ─────────────────────────────────────────────────
  useEffect(() => {
    if (!cameraActive || !videoRef.current || !streamRef.current) return;

    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video.play().catch(() => {});

    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');

    if ('BarcodeDetector' in window) {
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      intervalRef.current = setInterval(async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            clearInterval(intervalRef.current!);
            intervalRef.current = null;
            stopCamera();
            identifyCustomer(barcodes[0].rawValue);
          }
        } catch { /* frame not ready */ }
      }, 300);
    } else if (ctx) {
      intervalRef.current = setInterval(() => {
        if (!videoRef.current || !streamRef.current) return;
        if (video.videoWidth === 0) return;
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          stopCamera();
          identifyCustomer(code.data);
        }
      }, 300);
    }

    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraActive]);

  async function startCamera() {
    if (typeof window !== 'undefined' && location.protocol !== 'https:' && location.hostname !== 'localhost') {
      setErrorMsg(t('scanner.httpsRequired'));
      setStatus('error');
      return;
    }
    try {
      let stream: MediaStream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); }
      catch { stream = await navigator.mediaDevices.getUserMedia({ video: true }); }
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err: any) {
      const msg =
        err.name === 'NotAllowedError'  ? t('scanner.cameraBlocked') :
        err.name === 'NotFoundError'    ? t('scanner.noCamera') :
        `${t('scanner.cameraError')} (${err.name}). ${t('scanner.manualTitle')}.`;
      setErrorMsg(msg);
      setStatus('error');
    }
  }

  function stopCamera() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (streamRef.current)   { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setCameraActive(false);
  }

  // ── Step 1: Identify customer ───────────────────────────────────────────
  async function identifyCustomer(token: string) {
    setStatus('identifying');
    setErrorMsg('');
    setResult(null);
    setIdentifiedCustomer(null);
    setPendingScanToken(token);

    try {
      // Use POST with a GET-style check: we call the scan GET endpoint
      // But the public scanner uses X-Scanner-Token which only works with POST.
      // So if no actions configured, go straight to POST (old behavior).
      const activeActions = scanActions.filter(a => a.points_value > 0);
      if (activeActions.length === 0) {
        applyAction(token, null);
        return;
      }

      // For the identify step, we do a POST without action (just to get customer info)
      // Actually, the GET endpoint requires owner auth. So for public scanner with actions,
      // we show the action buttons without pre-identifying (we trust the scan to resolve).
      // We'll show a "confirm customer" step after the POST returns.
      setIdentifiedCustomer({ id: '', first_name: '', last_name: '', total_points: 0 });
      setStatus('identified');
    } catch {
      setErrorMsg(t('common.networkError'));
      setStatus('error');
    }
  }

  // ── Step 2: Apply scan action (POST) ────────────────────────────────────
  async function applyAction(token: string, actionId: string | null) {
    setStatus('loading');
    setErrorMsg('');

    const idempotencyKey = crypto.randomUUID();

    try {
      const res = await fetch(`/api/scan/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: {
          'X-Scanner-Token': scannerToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idempotency_key: idempotencyKey,
          ...(actionId ? { scan_action_id: actionId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error || t('scanner.scanError')); setStatus('error'); return; }
      setResult(data);
      setStatus('success');
      setManualId('');
      setIdentifiedCustomer(null);
    } catch {
      setErrorMsg(t('common.networkError'));
      setStatus('error');
    }
  }

  function reset() { setResult(null); setStatus('idle'); setErrorMsg(''); setManualId(''); setIdentifiedCustomer(null); setPendingScanToken(''); }

  const activeActions = scanActions.filter(a => a.points_value > 0);
  const unitLabel = programType === 'stamps' ? 'tampon(s)' : 'pts';

  // ── Render: invalid token ──────────────────────────────────────────────
  if (pageState === 'invalid') {
    return (
      <div style={{ minHeight: '100vh', background: '#F8F9FA', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: 'center', maxWidth: '360px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: '0 0 0.5rem' }}>{t('publicScanner.invalidLink')}</h1>
          <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>{t('publicScanner.invalidLinkDesc')}</p>
        </div>
      </div>
    );
  }

  if (pageState === 'validating') {
    return (
      <div style={{ minHeight: '100vh', background: '#F8F9FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: '#9CA3AF' }}>{t('publicScanner.loading')}</p>
      </div>
    );
  }

  // ── Render: scanner UI ─────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FA', fontFamily: "'DM Sans', sans-serif", padding: '1.5rem', maxWidth: '480px', margin: '0 auto' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        @keyframes scaleIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .result-card { animation: scaleIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        @keyframes confettiFall {
          0%   { transform: translateY(-20px) rotate(0deg);   opacity: 1; }
          100% { transform: translateY(280px) rotate(720deg); opacity: 0; }
        }
        .confetti-piece { position: absolute; width: 8px; height: 8px; border-radius: 2px; animation: confettiFall 1.6s ease-in forwards; }
        .action-btn { transition: transform 0.1s, box-shadow 0.1s; }
        .action-btn:active { transform: scale(0.96); }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '2rem', paddingBottom: '1.25rem', borderBottom: '1px solid #F3F4F6' }}>
        <div style={{ display: 'inline-block', background: brandColor, color: 'white', borderRadius: '10px', padding: '0.4rem 0.875rem', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          {restaurantName}
        </div>
        <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#111827' }}>{t('scanner.title')}</h1>
        <p style={{ margin: 0, fontSize: '0.8rem', color: '#9CA3AF' }}>{t('scanner.subtitle')}</p>
      </div>

      {/* ── Success result card ─────────────────────────────────────────── */}
      {status === 'success' && result && (
        <div className="result-card" style={{ background: 'white', borderRadius: '20px', padding: '2rem', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', marginBottom: '1.5rem', position: 'relative', overflow: 'hidden' }}>
          {result.stamp_card_completed && (
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {[
                { left: '10%', delay: '0s',    color: '#F59E0B' }, { left: '20%', delay: '0.1s',  color: '#10B981' },
                { left: '32%', delay: '0.05s', color: '#6366F1' }, { left: '45%', delay: '0.15s', color: '#EF4444' },
                { left: '55%', delay: '0s',    color: '#F59E0B' }, { left: '65%', delay: '0.2s',  color: '#10B981' },
                { left: '75%', delay: '0.08s', color: '#6366F1' }, { left: '85%', delay: '0.12s', color: '#EF4444' },
                { left: '25%', delay: '0.3s',  color: '#F59E0B' }, { left: '50%', delay: '0.25s', color: '#6366F1' },
                { left: '70%', delay: '0.18s', color: '#10B981' }, { left: '90%', delay: '0.35s', color: '#EF4444' },
              ].map((p, i) => (
                <div key={i} className="confetti-piece" style={{ left: p.left, top: '-12px', background: p.color, animationDelay: p.delay }} />
              ))}
            </div>
          )}

          {result.stamp_card_completed ? (
            <>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎉</div>
              <h2 style={{ color: '#059669', fontWeight: 700, margin: '0 0 0.5rem' }}>{t('scanner.cardComplete')}</h2>
              <p style={{ color: '#065F46', background: '#D1FAE5', padding: '0.75rem', borderRadius: '10px', fontSize: '0.9rem', margin: '0 0 1.25rem' }}>{result.reward_message}</p>
            </>
          ) : result.reward_triggered ? (
            <>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🏆</div>
              <h2 style={{ color: '#D97706', fontWeight: 700, margin: '0 0 0.5rem' }}>{t('scanner.rewardUnlocked')}</h2>
              <p style={{ color: '#92400E', background: '#FEF3C7', padding: '0.75rem', borderRadius: '10px', fontSize: '0.9rem', margin: '0 0 1.25rem' }}>{result.reward_message}</p>
            </>
          ) : (
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>✅</div>
          )}

          <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.2rem' }}>{result.customer.first_name} {result.customer.last_name}</h3>

          {result.scan_action_label && (
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#6B7280' }}>{result.scan_action_label}</p>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', margin: '1.25rem 0' }}>
            {result.program_type === 'stamps' ? (
              <>
                <div style={{ background: result.stamp_card_completed ? '#D1FAE5' : '#F0FDF4', borderRadius: '12px', padding: '0.875rem 1.5rem' }}>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#6B7280' }}>{result.stamp_card_completed ? t('scanner.cardCompleted') : t('scanner.stampAdded')}</p>
                  <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: result.stamp_card_completed ? '#059669' : '#16A34A' }}>{result.stamp_card_completed ? '✓' : `+${result.stamps_added}`}</p>
                </div>
                <div style={{ background: '#EFF6FF', borderRadius: '12px', padding: '0.875rem 1.5rem' }}>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#6B7280' }}>{result.stamp_card_completed ? t('scanner.newCard') : t('scanner.card')}</p>
                  <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#2563EB' }}>{result.customer.stamps_count} / {result.stamps_total}</p>
                </div>
              </>
            ) : (
              <>
                <div style={{ background: '#F0FDF4', borderRadius: '12px', padding: '0.875rem 1.5rem' }}>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#6B7280' }}>{t('scanner.pointsAdded')}</p>
                  <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#16A34A' }}>+{result.points_added}</p>
                </div>
                <div style={{ background: '#EFF6FF', borderRadius: '12px', padding: '0.875rem 1.5rem' }}>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#6B7280' }}>{t('scanner.totalPoints')}</p>
                  <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#2563EB' }}>{result.customer.total_points}</p>
                </div>
              </>
            )}
          </div>

          <button onClick={reset} style={{ background: '#111827', color: 'white', border: 'none', padding: '0.875rem 2rem', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', width: '100%' }}>
            {t('scanner.scanAnother')}
          </button>
        </div>
      )}

      {/* ── Action buttons (after QR scan, before applying) ────────────── */}
      {status === 'identified' && (
        <div className="result-card" style={{
          background: 'white', borderRadius: '20px',
          padding: '1.5rem', textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          marginBottom: '1.5rem',
        }}>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
            {t('scanner.chooseAction')}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {activeActions.map(action => (
              <button
                key={action.id}
                className="action-btn"
                onClick={() => applyAction(pendingScanToken, action.id)}
                style={{
                  background: '#111827', color: 'white', border: 'none',
                  padding: '1rem 1.25rem', borderRadius: '14px',
                  fontSize: '1rem', fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  minHeight: '56px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {action.icon && <span style={{ fontSize: '1.2rem' }}>{action.icon}</span>}
                  {action.label}
                </span>
                <span style={{
                  background: 'rgba(255,255,255,0.2)', borderRadius: '8px',
                  padding: '0.25rem 0.625rem', fontSize: '0.85rem', fontWeight: 700,
                }}>
                  +{action.points_value} {unitLabel}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={reset}
            style={{
              marginTop: '1rem', background: 'transparent', color: '#9CA3AF',
              border: '1.5px solid #E5E7EB', padding: '0.75rem',
              borderRadius: '12px', fontSize: '0.85rem', fontWeight: 500,
              cursor: 'pointer', width: '100%',
            }}
          >{t('scanner.cancel')}</button>
        </div>
      )}

      {/* ── Identifying / loading spinner ──────────────────────────────── */}
      {(status === 'identifying' || status === 'loading') && (
        <div style={{ background: 'white', borderRadius: '20px', padding: '2rem', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '1.5rem' }}>
          <p style={{ color: '#9CA3AF', fontSize: '0.9rem' }}>{t('scanner.processing')}</p>
        </div>
      )}

      {/* Camera + manual */}
      {!['success', 'identified', 'identifying', 'loading'].includes(status) && (
        <>
          <div style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', marginBottom: '1.25rem', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1.5px solid #F3F4F6' }}>
            {cameraActive ? (
              <div style={{ position: 'relative' }}>
                <video ref={videoRef} style={{ width: '100%', display: 'block', maxHeight: '300px', objectFit: 'cover' }} autoPlay muted playsInline />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '200px', height: '200px', border: '3px solid white', borderRadius: '16px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)' }} />
                </div>
                <button onClick={stopCamera} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '8px', padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                  {t('scanner.closeBtn')}
                </button>
              </div>
            ) : (
              <div onClick={startCamera} style={{ padding: '3rem 2rem', textAlign: 'center', cursor: 'pointer', background: 'linear-gradient(135deg, #F9FAFB, #F3F4F6)' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📷</div>
                <p style={{ fontWeight: 600, margin: '0 0 0.25rem', color: '#111827' }}>{t('scanner.cameraBtn')}</p>
                <p style={{ fontSize: '0.8rem', color: '#9CA3AF', margin: 0 }}>{t('scanner.cameraActivate')}</p>
              </div>
            )}
          </div>

          <div style={{ background: 'white', borderRadius: '20px', padding: '1.5rem', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1.5px solid #F3F4F6' }}>
            <p style={{ fontWeight: 600, margin: '0 0 0.25rem', fontSize: '0.9rem', color: '#374151' }}>{t('scanner.manualTitle')}</p>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.75rem', color: '#9CA3AF' }}>{t('scanner.manualHint')}</p>
            <input
              value={manualId}
              onChange={e => setManualId(e.target.value.trim())}
              placeholder="Code du pass client..."
              style={{ width: '100%', padding: '0.875rem 1rem', borderRadius: '12px', border: '1.5px solid #E5E7EB', fontSize: '0.875rem', fontFamily: 'monospace', marginBottom: '0.75rem', outline: 'none' }}
            />
            <button
              onClick={() => manualId && identifyCustomer(manualId)}
              disabled={!manualId || status === 'loading'}
              style={{ background: !manualId ? '#E5E7EB' : '#111827', color: !manualId ? '#9CA3AF' : 'white', border: 'none', padding: '0.875rem', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 600, cursor: !manualId ? 'not-allowed' : 'pointer', width: '100%', fontFamily: "'DM Sans', sans-serif" }}
            >
              {t('scanner.validateBtn')}
            </button>
          </div>

          {status === 'error' && (
            <div style={{ marginTop: '1rem', background: '#FEF2F2', borderRadius: '12px', padding: '1rem', color: '#DC2626', fontSize: '0.875rem', textAlign: 'center' }}>
              {errorMsg}
              <button onClick={reset} style={{ display: 'block', margin: '0.75rem auto 0', background: 'transparent', border: 'none', color: '#DC2626', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}>{t('scanner.scanAnother')}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
