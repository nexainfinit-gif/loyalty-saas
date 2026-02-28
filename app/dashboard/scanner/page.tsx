'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface ScanResult {
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    total_points: number;
  };
  points_added: number;
  reward_triggered: boolean;
  reward_message: string;
}

export default function ScannerPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [manualId, setManualId] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/dashboard/login');
      else setSession(session);
    });
    return () => stopCamera();
  }, [router]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
      scanQRFromCamera();
    } catch (err) {
      setErrorMsg('Impossible d\'accéder à la caméra. Utilisez la saisie manuelle.');
      setStatus('error');
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  async function scanQRFromCamera() {
    // Utilise BarcodeDetector si disponible (Chrome Android)
    if ('BarcodeDetector' in window) {
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      const interval = setInterval(async () => {
        if (!videoRef.current || !streamRef.current) {
          clearInterval(interval);
          return;
        }
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            clearInterval(interval);
            stopCamera();
            await processScan(barcodes[0].rawValue);
          }
        } catch {}
      }, 500);
    }
  }

  async function processScan(customerId: string) {
    if (!session) return;
    setStatus('loading');
    setErrorMsg('');
    setResult(null);

    try {
      const res = await fetch(`/api/scan/${customerId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Erreur lors du scan');
        setStatus('error');
        return;
      }

      setResult(data);
      setStatus('success');
      setManualId('');
    } catch (err) {
      setErrorMsg('Erreur réseau');
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
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button
          onClick={() => { stopCamera(); router.push('/dashboard'); }}
          style={{ background: 'white', border: '1.5px solid #E5E7EB', borderRadius: '10px', padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '1rem' }}
        >←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Scanner QR Code</h1>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#9CA3AF' }}>Scan en caisse</p>
        </div>
      </div>

      {/* Success */}
      {status === 'success' && result && (
        <div className="result-card" style={{
          background: 'white', borderRadius: '20px',
          padding: '2rem', textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          marginBottom: '1.5rem',
        }}>
          {result.reward_triggered ? (
            <>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🏆</div>
              <h2 style={{ color: '#D97706', fontWeight: 700, margin: '0 0 0.5rem' }}>
                Récompense débloquée !
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
            <div style={{ background: '#F0FDF4', borderRadius: '12px', padding: '0.875rem 1.5rem' }}>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#6B7280' }}>Points ajoutés</p>
              <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#16A34A' }}>+{result.points_added}</p>
            </div>
            <div style={{ background: '#EFF6FF', borderRadius: '12px', padding: '0.875rem 1.5rem' }}>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#6B7280' }}>Total points</p>
              <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#2563EB' }}>{result.customer.total_points}</p>
            </div>
          </div>

          <button
            onClick={reset}
            style={{
              background: '#111827', color: 'white', border: 'none',
              padding: '0.875rem 2rem', borderRadius: '12px',
              fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', width: '100%',
            }}
          >Scanner un autre client</button>
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
                  muted playsInline
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
                >✕ Fermer</button>
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
                <p style={{ fontWeight: 600, margin: '0 0 0.25rem', color: '#111827' }}>Scanner avec la caméra</p>
                <p style={{ fontSize: '0.8rem', color: '#9CA3AF', margin: 0 }}>Appuyez pour activer</p>
              </div>
            )}
          </div>

          {/* Manuel */}
          <div style={{
            background: 'white', borderRadius: '20px', padding: '1.5rem',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1.5px solid #F3F4F6',
          }}>
            <p style={{ fontWeight: 600, margin: '0 0 1rem', fontSize: '0.9rem', color: '#374151' }}>
              Ou saisir l'ID manuellement
            </p>
            <input
              value={manualId}
              onChange={e => setManualId(e.target.value)}
              placeholder="UUID du client..."
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
              {status === 'loading' ? '⏳ Traitement...' : 'Valider le scan'}
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
