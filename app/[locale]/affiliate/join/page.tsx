'use client';

import { useState } from 'react';

export default function AffiliateJoinPage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/affiliate/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setStatus('success');
      } else {
        const j = await res.json().catch(() => null);
        setErrorMsg(j?.error || 'Une erreur est survenue.');
        setStatus('error');
      }
    } catch {
      setErrorMsg('Erreur réseau. Réessayez.');
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-[#0f172a]">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1e293b] to-[#0f172a]" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary-600/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-emerald-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />

        <div className="relative max-w-5xl mx-auto px-6 pt-16 pb-20">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-6">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm text-gray-300">Programme ouvert aux candidatures</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight mb-4">
              Devenez partenaire<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-emerald-400">Rebites</span>
            </h1>
            <p className="text-lg text-gray-400 max-w-xl mx-auto">
              Recommandez Rebites aux commerces de votre réseau et gagnez une commission récurrente sur chaque abonnement.
            </p>
          </div>

          {/* Avantages */}
          <div className="grid md:grid-cols-3 gap-6 mb-20">
            {[
              {
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                ),
                title: 'Commission récurrente',
                desc: 'Touchez un pourcentage sur chaque paiement mensuel de vos filleuls, aussi longtemps qu\'ils restent abonnés.',
              },
              {
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                ),
                title: 'Lien de parrainage unique',
                desc: 'Partagez votre lien personnalisé. Chaque établissement inscrit via votre lien est automatiquement rattaché à votre compte.',
              },
              {
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
                  </svg>
                ),
                title: 'Tableau de bord dédié',
                desc: 'Suivez vos parrainages, commissions en attente et versements en temps réel depuis votre espace affilié.',
              },
            ].map((item, i) => (
              <div key={i} className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6">
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-emerald-400 mb-4">
                  {item.icon}
                </div>
                <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* Comment ça marche */}
          <div className="mb-20">
            <h2 className="text-2xl font-bold text-white text-center mb-10">Comment ça marche</h2>
            <div className="grid md:grid-cols-4 gap-4">
              {[
                { step: '1', title: 'Postulez', desc: 'Remplissez le formulaire ci-dessous.' },
                { step: '2', title: 'Validation', desc: 'Notre équipe examine votre candidature.' },
                { step: '3', title: 'Partagez', desc: 'Recevez votre lien et recommandez Rebites.' },
                { step: '4', title: 'Gagnez', desc: 'Commission versée à chaque paiement.' },
              ].map((s, i) => (
                <div key={i} className="relative text-center">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-emerald-500 flex items-center justify-center text-white font-bold text-sm mx-auto mb-3">
                    {s.step}
                  </div>
                  <h4 className="text-white font-semibold text-sm mb-1">{s.title}</h4>
                  <p className="text-xs text-gray-400">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Formulaire */}
          <div id="apply" className="max-w-lg mx-auto">
            <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8">
              <h2 className="text-xl font-bold text-white text-center mb-1">Postuler au programme</h2>
              <p className="text-sm text-gray-400 text-center mb-6">
                Nous reviendrons vers vous sous 48h.
              </p>

              {status === 'success' ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Candidature envoyée !</h3>
                  <p className="text-sm text-gray-400">
                    Merci pour votre intérêt. Nous examinons votre demande et vous recontactons rapidement par email.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Nom complet *</label>
                    <input
                      required
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Jean Dupont"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Email *</label>
                    <input
                      required
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="jean@exemple.com"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Téléphone</label>
                    <input
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="+32 4XX XX XX XX"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Comment comptez-vous promouvoir Rebites ?</label>
                    <textarea
                      value={form.message}
                      onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                      rows={3}
                      placeholder="Réseau de commerçants, agence web, consultant..."
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-gray-600 focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600 outline-none resize-none"
                    />
                  </div>

                  {status === 'error' && (
                    <p className="text-sm text-red-400">{errorMsg}</p>
                  )}

                  <button
                    type="submit"
                    disabled={status === 'loading'}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-emerald-500 text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-50"
                  >
                    {status === 'loading' ? 'Envoi en cours...' : 'Envoyer ma candidature'}
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-16">
            <p className="text-xs text-gray-500">
              Rebites — Programme Affiliés · <a href="https://rebites.be" className="text-gray-400 hover:text-white transition">rebites.be</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
