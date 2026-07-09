'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n';

/**
 * Recadreur de logo carré, sans dépendance : glisser pour positionner,
 * curseur pour zoomer, export canvas 512×512 PNG. Utilisé par les réglages
 * établissement avant l'upload (le fichier envoyé est déjà recadré).
 */
const VIEW = 280;   // viewport carré à l'écran
const OUT  = 512;   // taille de sortie

export default function LogoCropper({
  file, onCancel, onCropped,
}: {
  file: File;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}) {
  const { t } = useTranslation();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);          // 1 = l'image entière tient (contain)
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  // URL objet dérivée du fichier (pas de setState dans l'effet — règle lint)
  const srcUrl = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i); // callback async : autorisé
    i.src = srcUrl;
    return () => URL.revokeObjectURL(srcUrl);
  }, [srcUrl]);

  if (!img) return null;

  // Échelle « contain » de base : l'image entière visible à zoom 1 (fonds
  // transparents fréquents sur les logos → pas de recadrage destructif par défaut).
  const base = Math.min(VIEW / img.width, VIEW / img.height);
  const scale = base * zoom;
  const w = img.width * scale, h = img.height * scale;
  // bornes de déplacement : l'image peut aller bord à bord
  const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));
  const limX = Math.max(0, (w - VIEW) / 2) + VIEW * 0.25;
  const limY = Math.max(0, (h - VIEW) / 2) + VIEW * 0.25;

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setOff({
      x: clamp(drag.current.ox + (e.clientX - drag.current.x), limX),
      y: clamp(drag.current.oy + (e.clientY - drag.current.y), limY),
    });
  }
  function onPointerUp() { drag.current = null; }

  function confirm() {
    const canvas = document.createElement('canvas');
    canvas.width = OUT; canvas.height = OUT;
    const ctx = canvas.getContext('2d')!;
    const k = OUT / VIEW; // écran → sortie
    ctx.drawImage(
      img!,
      (VIEW / 2 + off.x - w / 2) * k,
      (VIEW / 2 + off.y - h / 2) * k,
      w * k, h * k,
    );
    // Rognage auto des marges transparentes : le fichier livré est serré sur
    // le visuel (sinon les logos « flottent » petits dans emails et pass).
    const data = ctx.getImageData(0, 0, OUT, OUT).data;
    let minX = OUT, minY = OUT, maxX = -1, maxY = -1;
    for (let y = 0; y < OUT; y++) {
      for (let x = 0; x < OUT; x++) {
        if (data[(y * OUT + x) * 4 + 3] > 8) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) { canvas.toBlob(b => { if (b) onCropped(b); }, 'image/png'); return; }
    const pad = Math.round(OUT * 0.02);
    const bx = Math.max(0, minX - pad), by = Math.max(0, minY - pad);
    const bw = Math.min(OUT, maxX + pad + 1) - bx, bh = Math.min(OUT, maxY + pad + 1) - by;
    const out = document.createElement('canvas');
    out.width = bw; out.height = bh;
    out.getContext('2d')!.drawImage(canvas, bx, by, bw, bh, 0, 0, bw, bh);
    out.toBlob(b => { if (b) onCropped(b); }, 'image/png');
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('settings.logoCropTitle')}</h3>

        <div
          className="relative mx-auto overflow-hidden rounded-xl border border-gray-200 touch-none cursor-grab active:cursor-grabbing"
          style={{ width: VIEW, height: VIEW, background: 'repeating-conic-gradient(#f3f4f6 0% 25%, #ffffff 0% 50%) 50% / 20px 20px' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={srcUrl}
            alt=""
            draggable={false}
            className="absolute select-none pointer-events-none"
            style={{
              width: w, height: h, maxWidth: 'none',
              left: VIEW / 2 + off.x - w / 2,
              top:  VIEW / 2 + off.y - h / 2,
            }}
          />
        </div>

        <div className="flex items-center gap-3 mt-4">
          <span className="text-xs text-gray-400">−</span>
          <input
            type="range" min={0.5} max={3} step={0.01} value={zoom}
            onChange={e => setZoom(parseFloat(e.target.value))}
            className="flex-1 accent-primary-600"
          />
          <span className="text-sm text-gray-400">+</span>
        </div>

        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={confirm}
            className="flex-1 px-4 py-2.5 text-sm font-semibold bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors">
            {t('settings.logoCropConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
