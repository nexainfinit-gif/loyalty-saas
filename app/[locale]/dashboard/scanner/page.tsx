'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useSubscriptionGate } from '@/lib/use-subscription-gate';
import { useTranslation, useLocaleRouter } from '@/lib/i18n';
import jsQR from 'jsqr';

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
}

export default function ScannerPage() {
  const router = useLocaleRouter();
  const { t } = useTranslation();
  const { ready: subReady } = useSubscriptionGate();
  const [session, setSession]         = useState<any>(null);
  const [scannerUrl, setScannerUrl]   = useState<string | null>(null);
  const [urlCopied, setUrlCopied]     = useState(false);
  const [manualId, setManualId]       = useState('');
  const [result, setResult]           = useState<ScanResult | null>(null);
  const [status, setStatus]           = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg]       = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/dashboard/login'); return; }
      setSession(session);

      // Fetch the restaurant's scanner_token to build the public cashier URL.
      const { data: resto } = await supabase
        .from('restaurants')
        .select('scanner_token')
        .eq('owner_id', session.user.id)
        .maybeSingle();

      if (resto?.scanner_token) {
        const base = typeof window !== 'undefined' ? window.location.origin : '';
        setScannerUrl(`${base}/scan/${resto.scanner_token}`);
      }
    });
    return () => stopCamera();
  }, [router]);

  // Assign srcObject + start QR scanning AFTER cameraActive flips to true and <video> is in the DOM
  useEffect(() => {
    if (!cameraActive || !videoRef.current || !streamRef.current) return;

    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video.play().catch((err) => {
      console.error('[Scanner] video.play() failed:', err.name, err.message);
      setErrorMsg(t('scanner.cameraError', { errorName: `play: ${err.name}` }));
      setStatus('error');
      stopCamera();
    });

    // Give the video a moment to receive its first frame before scanning
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if ('BarcodeDetector' in window) {
      // Chrome / Edge: use native BarcodeDetector (fastest)
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      intervalRef.current = setInterval(async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            clearInterval(intervalRef.current!);
            intervalRef.current = null;
            stopCamera();
            processScan(barcodes[0].rawValue);
          }
        } catch { /* frame not ready yet — silent */ }
      }, 300);
    } else if (ctx) {
      // Firefox / Safari / iOS fallback: jsqr canvas decoding
      intervalRef.current = setInterval(() => {
        if (!videoRef.current || !streamRef.current) return;
        if (video.videoWidth === 0) return; // frame not ready yet
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          stopCamera();
          processScan(code.data);
        }
      }, 300);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraActive]);

  async function startCamera() {
    // HTTPS is required for getUserMedia (except localhost / 127.0.0.1)
    if (typeof window !== 'undefined' && location.protocol !== 'https:'
        && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      setErrorMsg(t('scanner.httpsRequired'));
      setStatus('error');
      return;
    }

    // Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg(t('scanner.cameraError', { errorName: 'MediaDevices API unavailable' }));
      setStatus('error');
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      } catch {
        // Fallback: try any camera (front-facing on desktop)
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err: any) {
      console.error('[Scanner] getUserMedia error:', err.name, err.message);
      const msg =
        err.name === 'NotAllowedError'
          ? t('scanner.cameraBlocked')
          : err.name === 'NotFoundError'
          ? t('scanner.noCamera')
          : err.name === 'NotReadableError'
          ? t('scanner.cameraError', { errorName: 'Camera already in use' })
          : t('scanner.cameraError', { errorName: err.name || err.message || 'Unknown error' });
      setErrorMsg(msg);
      setStatus('error');
    }
  }

  function stopCamera() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  async function processScan(scanToken: string) {
    if (!session) return;
    setStatus('loading');
    setErrorMsg('');
    setResult(null);

    // Generate idempotency key to prevent double-point on retry/double-tap
    const idempotencyKey = crypto.randomUUID();

    try {
      const res = await fetch(`/api/scan/${encodeURIComponent(scanToken)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idempotency_key: idempotencyKey }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || t('scanner.scanError'));
        setStatus('error');
        return;
      }

      setResult(data);
      setStatus('success');
      setManualId('');
    } catch {
      setErrorMsg(t('common.networkError'));
      setStatus('error');
    }
  }

  function reset() {
    setResult(null);
    setStatus('idle');
    setErrorMsg('');
    setManualId('');
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#F8F9FA',
      fontFamily: "'DM Sans', sans-serif",
      padding: '1.5rem',
      maxWidth: '480px',
      margin: '0 auto',
    }}>
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
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button
          onClick={() => { stopCamera(); router.push('/dashboard'); }}
          style={{ background: 'white', border: '1.5px solid #E5E7EB', borderRadius: '10px', padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '1rem' }}
        >←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>{t('scanner.title')}</h1>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#9CA3AF' }}>{t('scanner.subtitle')}</p>
        </div>
      </div>

      {/* Success */}
      {status === 'success' && result && (
        <div className="result-card" style={{
          background: 'white', borderRadius: '20px',
          padding: '2rem', textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          marginBottom: '1.5rem',
          position: 'relative', overflow: 'hidden',
        }}>

          {/* ── Confetti (stamps completion only) ── */}
          {result.stamp_card_completed && (
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {[
                { left: '10%', delay: '0s',    color: '#F59E0B' },
                { left: '20%', delay: '0.1s',  color: '#10B981' },
                { left: '32%', delay: '0.05s', color: '#6366F1' },
                { left: '45%', delay: '0.15s', color: '#EF4444' },
                { left: '55%', delay: '0s',    color: '#F59E0B' },
                { left: '65%', delay: '0.2s',  color: '#10B981' },
                { left: '75%', delay: '0.08s', color: '#6366F1' },
                { left: '85%', delay: '0.12s', color: '#EF4444' },
                { left: '25%', delay: '0.3s',  color: '#F59E0B' },
                { left: '50%', delay: '0.25s', color: '#6366F1' },
                { left: '70%', delay: '0.18s', color: '#10B981' },
                { left: '90%', delay: '0.35s', color: '#EF4444' },
              ].map((p, i) => (
                <div key={i} className="confetti-piece" style={{ left: p.left, top: '-12px', background: p.color, animationDelay: p.delay }} />
              ))}
            </div>
          )}

          {/* ── Header: completion / reward / normal ── */}
          {result.stamp_card_completed ? (
            <>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎉</div>
              <h2 style={{ color: '#059669', fontWeight: 700, margin: '0 0 0.5rem' }}>
                {t('scanner.cardComplete')}
              </h2>
              <p style={{ color: '#065F46', background: '#D1FAE5', padding: '0.75rem', borderRadius: '10px', fontSize: '0.9rem', margin: '0 0 1.25rem' }}>
                {result.reward_message}
              </p>
            </>
          ) : result.reward_triggered ? (
            <>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🏆</div>
              <h2 style={{ color: '#D97706', fontWeight: 700, margin: '0 0 0.5rem' }}>
                {t('scanner.rewardUnlocked')}
              </h2>
              <p style={{ color: '#92400E', background: '#FEF3C7', padding: '0.75rem', borderRadius: '10px', fontSize: '0.9rem', margin: '0 0 1.25rem' }}>
                {result.reward_message}
              </p>
            </>
          ) : (
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>✅</div>
          )}

          <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.2rem' }}>
            {result.customer.first_name} {result.customer.last_name}
          </h3>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', margin: '1.25rem 0' }}>
            {result.program_type === 'stamps' ? (
              <>
                <div style={{ background: result.stamp_card_completed ? '#D1FAE5' : '#F0FDF4', borderRadius: '12px', padding: '0.875rem 1.5rem' }}>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#6B7280' }}>
                    {result.stamp_card_completed ? t('scanner.cardCompleted') : t('scanner.stampAdded')}
                  </p>
                  <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: result.stamp_card_completed ? '#059669' : '#16A34A' }}>
                    {result.stamp_card_completed ? '✓' : `+${result.stamps_added}`}
                  </p>
                </div>
                <div style={{ background: '#EFF6FF', borderRadius: '12px', padding: '0.875rem 1.5rem' }}>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#6B7280' }}>
                    {result.stamp_card_completed ? t('scanner.newCard') : t('scanner.card')}
                  </p>
                  <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#2563EB' }}>
                    {result.customer.stamps_count} / {result.stamps_total}
                  </p>
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

          <button
            onClick={reset}
            style={{
              background: '#111827', color: 'white', border: 'none',
              padding: '0.875rem 2rem', borderRadius: '12px',
              fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', width: '100%',
            }}
          >{t('scanner.scanAnother')}</button>
        </div>
      )}

      {/* Cashier scanner link */}
      {scannerUrl && status !== 'success' && (
        <div style={{ background: '#EFF6FF', borderRadius: '16px', padding: '1rem 1.25rem', marginBottom: '1.25rem', border: '1.5px solid #BFDBFE' }}>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', fontWeight: 600, color: '#1D4ED8' }}>
            {t('scanner.cashierLinkTitle')}
          </p>
          <p style={{ margin: '0 0 0.625rem', fontSize: '0.75rem', color: '#3B82F6' }}>
            {t('scanner.cashierLinkDesc')}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              readOnly
              value={scannerUrl}
              style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #BFDBFE', fontSize: '0.75rem', fontFamily: 'monospace', background: 'white', color: '#1E40AF', outline: 'none' }}
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(scannerUrl);
                setUrlCopied(true);
                setTimeout(() => setUrlCopied(false), 2000);
              }}
              style={{ padding: '0.5rem 0.875rem', borderRadius: '8px', border: 'none', background: urlCopied ? '#059669' : '#2563EB', color: 'white', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.2s' }}
            >
              {urlCopied ? t('common.copied') : t('common.copy')}
            </button>
          </div>
        </div>
      )}

      {/* Camera */}
      {status !== 'success' && (
        <>
          <div style={{
            background: 'white', borderRadius: '20px',
            overflow: 'hidden', marginBottom: '1.25rem',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            border: '1.5px solid #F3F4F6',
          }}>
            {cameraActive ? (
              <div style={{ position: 'relative' }}>
                <video
                  ref={videoRef}
                  style={{ width: '100%', display: 'block', maxHeight: '300px', objectFit: 'cover' }}
                  autoPlay muted playsInline
                />
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{
                    width: '200px', height: '200px',
                    border: '3px solid white',
                    borderRadius: '16px',
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
                  }} />
                </div>
                <button
                  onClick={stopCamera}
                  style={{
                    position: 'absolute', top: '1rem', right: '1rem',
                    background: 'rgba(0,0,0,0.5)', color: 'white',
                    border: 'none', borderRadius: '8px',
                    padding: '0.4rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem',
                  }}
                >{t('scanner.closeBtn')}</button>
              </div>
            ) : (
              <div
                onClick={startCamera}
                style={{
                  padding: '3rem 2rem', textAlign: 'center', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #F9FAFB, #F3F4F6)',
                }}
              >
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📷</div>
                <p style={{ fontWeight: 600, margin: '0 0 0.25rem', color: '#111827' }}>{t('scanner.cameraBtn')}</p>
                <p style={{ fontSize: '0.8rem', color: '#9CA3AF', margin: 0 }}>{t('scanner.cameraActivate')}</p>
              </div>
            )}
          </div>

          {/* Manuel */}
          <div style={{
            background: 'white', borderRadius: '20px', padding: '1.5rem',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1.5px solid #F3F4F6',
          }}>
            <p style={{ fontWeight: 600, margin: '0 0 0.25rem', fontSize: '0.9rem', color: '#374151' }}>
              {t('scanner.manualTitle')}
            </p>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.75rem', color: '#9CA3AF' }}>
              {t('scanner.manualHint')}
            </p>
            <input
              value={manualId}
              onChange={e => setManualId(e.target.value.trim())}
              placeholder={t('scanner.manualPlaceholder')}
              style={{
                width: '100%', padding: '0.875rem 1rem',
                borderRadius: '12px', border: '1.5px solid #E5E7EB',
                fontSize: '0.875rem', fontFamily: 'monospace',
                marginBottom: '0.75rem', outline: 'none',
              }}
            />
            <button
              onClick={() => manualId && processScan(manualId)}
              disabled={!manualId || status === 'loading'}
              style={{
                background: !manualId ? '#E5E7EB' : '#111827',
                color: !manualId ? '#9CA3AF' : 'white',
                border: 'none', padding: '0.875rem',
                borderRadius: '12px', fontSize: '0.9rem',
                fontWeight: 600, cursor: !manualId ? 'not-allowed' : 'pointer',
                width: '100%', fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {status === 'loading' ? t('scanner.processing') : t('scanner.validateBtn')}
            </button>
          </div>

          {/* Erreur */}
          {status === 'error' && (
            <div style={{
              marginTop: '1rem', background: '#FEF2F2',
              borderRadius: '12px', padding: '1rem',
              color: '#DC2626', fontSize: '0.875rem', textAlign: 'center',
            }}>
              {errorMsg}
            </div>
          )}
        </>
      )}
    </div>
  );
}
