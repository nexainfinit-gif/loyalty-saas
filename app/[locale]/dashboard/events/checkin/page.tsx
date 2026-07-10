'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import jsQR from 'jsqr'
import { supabase } from '@/lib/supabase'
import { useTranslation } from '@/lib/i18n'

/**
 * Check-in des billets (T2) — /dashboard/events/checkin.
 * Scan caméra (BarcodeDetector natif, fallback jsQR) ou saisie manuelle du
 * code. Gros retours visuels pensés pour l'entrée d'une salle :
 * VERT = valide (entrée comptée), ORANGE = déjà utilisé, ROUGE = invalide.
 */
type BarcodeDetectorLike = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike

interface CheckinResult {
  result: 'ok' | 'already' | 'invalid' | 'wrong_event'
  reason?: string
  buyerName?: string
  eventTitle?: string
  tierName?: string | null
  seats?: number
  checkedInAt?: string
  checkedIn?: number
  total?: number
}

interface EvOption { id: string; title: string; starts_at: string; status: string }

const CODE_RE = /^EV-[A-Z2-9]{4}-[A-Z2-9]{4}$/

export default function CheckinPage() {
  const { t, locale } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const busyRef = useRef(false)

  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [manualCode, setManualCode] = useState('')
  const [result, setResult] = useState<CheckinResult | null>(null)
  const [counts, setCounts] = useState<{ checkedIn: number; total: number } | null>(null)

  // Épinglage anti-fraude : le portier choisit l'événement du soir —
  // un billet valide d'un AUTRE événement est alors signalé, pas admis.
  const [events, setEvents] = useState<EvOption[]>([])
  const [pinnedEventId, setPinnedEventId] = useState<string>('')
  const pinnedRef = useRef<string>('')
  useEffect(() => { pinnedRef.current = pinnedEventId }, [pinnedEventId])

  useEffect(() => {
    let stop = false
    async function loadEvents() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/events', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (!res.ok || stop) return
      const j = await res.json()
      const published = (j.events ?? []).filter((e: EvOption) => e.status === 'published')
      setEvents(published)
      // Pré-épingle l'événement le plus proche dans le temps
      if (published.length === 1) setPinnedEventId(published[0].id)
    }
    loadEvents()
    return () => { stop = true }
  }, [])

  const submit = useCallback(async (raw: string) => {
    const code = raw.trim().toUpperCase()
    if (!CODE_RE.test(code) || busyRef.current) {
      if (!CODE_RE.test(code)) setResult({ result: 'invalid' })
      return
    }
    busyRef.current = true
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/events/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ code, ...(pinnedRef.current ? { eventId: pinnedRef.current } : {}) }),
      })
      const j = await res.json()
      const r: CheckinResult = res.ok && j.result ? j : { result: 'invalid' }
      setResult(r)
      if (r.total !== undefined) setCounts({ checkedIn: r.checkedIn ?? 0, total: r.total })
      if (navigator.vibrate) navigator.vibrate(r.result === 'ok' ? 80 : [60, 60, 60])
      // Reprise auto du scan après le verdict
      setTimeout(() => { setResult(null); busyRef.current = false }, r.result === 'ok' ? 2000 : 3000)
    } catch {
      busyRef.current = false
    }
  }, [])

  /* ── Caméra + détection QR (BarcodeDetector natif, fallback jsQR) ── */
  useEffect(() => {
    let stopped = false
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(t('checkin.noCamera'))
        return
      }
      try {
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true })
        }
        if (stopped) { stream.getTracks().forEach(tr => tr.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setCameraActive(true)

        const detector = 'BarcodeDetector' in window
          ? new ((window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector)({ formats: ['qr_code'] })
          : null

        intervalRef.current = setInterval(async () => {
          const video = videoRef.current
          if (!video || video.readyState < 2 || busyRef.current) return
          if (detector) {
            try {
              const codes = await detector.detect(video)
              if (codes[0]?.rawValue) submit(codes[0].rawValue)
            } catch { /* frame ratée */ }
          } else {
            const canvas = canvasRef.current
            if (!canvas) return
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            if (!ctx || !canvas.width) return
            ctx.drawImage(video, 0, 0)
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const qr = jsQR(img.data, img.width, img.height)
            if (qr?.data) submit(qr.data)
          }
        }, 350)
      } catch (err) {
        const e = err as { name?: string }
        setCameraError(e.name === 'NotAllowedError' ? t('checkin.cameraBlocked') : t('checkin.noCamera'))
      }
    }
    start()
    return () => {
      stopped = true
      if (intervalRef.current) clearInterval(intervalRef.current)
      streamRef.current?.getTracks().forEach(tr => tr.stop())
    }
  }, [submit, t])

  const verdictStyle = result?.result === 'ok'
    ? { bg: '#0BA84A', icon: '✓', title: t('checkin.valid') }
    : result?.result === 'already'
      ? { bg: '#E58F00', icon: '⟳', title: t('checkin.already') }
      : result?.result === 'wrong_event'
        ? { bg: '#7C3AED', icon: '↷', title: t('checkin.wrongEvent') }
        : { bg: '#DC2626', icon: '✕', title: result?.reason === 'event_cancelled' ? t('checkin.cancelledEvent') : t('checkin.invalid') }

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <Link href={`/${locale}/dashboard/events`} className="text-sm text-white/60 hover:text-white transition-colors">
          ← {t('checkin.back')}
        </Link>
        <p className="text-sm font-semibold">{t('checkin.title')}</p>
        <span className="text-sm font-mono text-white/60 min-w-[64px] text-right">
          {counts ? `${counts.checkedIn}/${counts.total}` : ''}
        </span>
      </div>

      {/* Épinglage de l'événement du soir */}
      {events.length > 0 && (
        <div className="px-4 pb-2">
          <select
            value={pinnedEventId}
            onChange={e => setPinnedEventId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white text-sm focus:outline-none focus:border-white/40"
          >
            <option value="" className="text-gray-900">{t('checkin.allEvents')}</option>
            {events.map(ev => (
              <option key={ev.id} value={ev.id} className="text-gray-900">
                {ev.title} — {new Date(ev.starts_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Caméra */}
      <div className="relative flex-1 overflow-hidden">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />

        {!cameraActive && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-white/50 animate-pulse">{t('checkin.starting')}</p>
          </div>
        )}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
            <p className="text-sm text-white/60">{cameraError}</p>
          </div>
        )}

        {/* Viseur */}
        {cameraActive && !result && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-56 h-56 rounded-3xl border-4 border-white/70" />
          </div>
        )}

        {/* Verdict plein écran */}
        {result && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center transition-colors"
            style={{ background: verdictStyle.bg }}>
            <span className="text-7xl font-black leading-none">{verdictStyle.icon}</span>
            <p className="text-2xl font-bold mt-4">{verdictStyle.title}</p>
            {/* Table VIP / catégorie : info CRUCIALE pour le portier */}
            {result.result === 'ok' && (result.seats ?? 1) > 1 && (
              <p className="text-3xl font-black mt-3 bg-white/20 rounded-2xl px-5 py-2">
                {result.tierName} — {result.seats} {t('checkin.seats')}
              </p>
            )}
            {result.result === 'ok' && (result.seats ?? 1) <= 1 && result.tierName && (
              <p className="text-lg font-bold mt-3 bg-white/20 rounded-xl px-4 py-1.5">{result.tierName}</p>
            )}
            {result.buyerName && <p className="text-lg mt-2 font-medium">{result.buyerName}</p>}
            {result.eventTitle && <p className="text-sm mt-0.5 opacity-80">{result.eventTitle}</p>}
            {result.result === 'already' && result.checkedInAt && (
              <p className="text-sm mt-2 opacity-80">
                {t('checkin.alreadyAt', {
                  time: new Date(result.checkedInAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
                })}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Saisie manuelle */}
      <form
        onSubmit={e => { e.preventDefault(); submit(manualCode); setManualCode('') }}
        className="p-4 flex gap-2 bg-gray-950"
      >
        <input
          value={manualCode}
          onChange={e => setManualCode(e.target.value.toUpperCase())}
          placeholder="EV-XXXX-XXXX"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 font-mono text-sm tracking-widest focus:outline-none focus:border-white/40"
        />
        <button
          type="submit"
          className="px-5 py-3 rounded-xl bg-white text-gray-950 text-sm font-bold"
        >
          {t('checkin.check')}
        </button>
      </form>
    </div>
  )
}
