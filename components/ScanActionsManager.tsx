'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';

interface ScanAction {
  id: string;
  label: string;
  icon: string | null;
  points_value: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

interface Props {
  programType: 'points' | 'stamps';
}

const EMOJI_PRESETS = ['☕', '🍽️', '🥐', '🍕', '🍔', '🥗', '🍰', '🛒', '💳', '⭐'];

export default function ScanActionsManager({ programType }: Props) {
  const { t } = useTranslation();
  const [actions, setActions]   = useState<ScanAction[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [showForm, setShowForm] = useState(false);
  const [token, setToken]       = useState('');

  // Form state
  const [formLabel, setFormLabel]     = useState('');
  const [formIcon, setFormIcon]       = useState('');
  const [formValue, setFormValue]     = useState(1);
  const [editingId, setEditingId]     = useState<string | null>(null);

  const unitLabel = programType === 'stamps' ? 'tampon(s)' : 'point(s)';

  // Get access token
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setToken(session.access_token);
    });
  }, []);

  const fetchActions = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/scan-actions', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setActions(data.actions ?? []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchActions(); }, [fetchActions]);

  async function handleSave() {
    if (!formLabel.trim()) return;
    setSaving(true);
    setError('');

    try {
      const method = editingId ? 'PATCH' : 'POST';
      const body: Record<string, unknown> = {
        label: formLabel.trim(),
        icon: formIcon || null,
        points_value: formValue,
      };
      if (editingId) body.id = editingId;

      const res = await fetch('/api/scan-actions', {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Erreur');
        return;
      }

      resetForm();
      fetchActions();
    } catch {
      setError('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(action: ScanAction) {
    try {
      await fetch('/api/scan-actions', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: action.id, is_active: !action.is_active }),
      });
      fetchActions();
    } catch { /* silent */ }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/scan-actions?id=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      fetchActions();
    } catch { /* silent */ }
  }

  function startEdit(action: ScanAction) {
    setEditingId(action.id);
    setFormLabel(action.label);
    setFormIcon(action.icon ?? '');
    setFormValue(action.points_value);
    setShowForm(true);
  }

  function resetForm() {
    setFormLabel('');
    setFormIcon('');
    setFormValue(1);
    setEditingId(null);
    setShowForm(false);
    setError('');
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
        <p className="text-gray-400 text-sm text-center">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Actions de scan</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Boutons rapides pour le scanner en caisse
          </p>
        </div>
        {!showForm && actions.length < 10 && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 bg-primary-600 text-white text-xs font-semibold rounded-xl hover:bg-primary-700 transition-colors"
          >
            + Ajouter
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nom du bouton</label>
              <input
                value={formLabel}
                onChange={e => setFormLabel(e.target.value)}
                placeholder="ex: Café, Menu midi, Achat 10€+"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Icône (optionnel)</label>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {EMOJI_PRESETS.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setFormIcon(formIcon === emoji ? '' : emoji)}
                    className={`w-8 h-8 rounded-lg text-base flex items-center justify-center border transition-all ${
                      formIcon === emoji
                        ? 'border-primary-600 bg-primary-50 ring-2 ring-primary-600/20'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Valeur ({unitLabel})
              </label>
              <input
                type="number"
                min={1}
                max={1000}
                value={formValue}
                onChange={e => setFormValue(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/20 focus:border-primary-600"
              />
            </div>

            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !formLabel.trim()}
                className="flex-1 px-3 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? '...' : editingId ? 'Modifier' : 'Créer'}
              </button>
              <button
                onClick={resetForm}
                className="px-3 py-2 border border-gray-200 text-gray-500 text-sm rounded-xl hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Actions list */}
      {actions.length === 0 && !showForm ? (
        <div className="text-center py-6">
          <p className="text-2xl mb-2">📱</p>
          <p className="text-sm text-gray-500 mb-1">Aucune action configurée</p>
          <p className="text-xs text-gray-400">
            Ajoutez des boutons pour que le scanner affiche des actions rapides.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {actions.map(action => (
            <div
              key={action.id}
              className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                action.is_active
                  ? 'border-gray-100 bg-white'
                  : 'border-gray-100 bg-gray-50 opacity-60'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {action.icon && <span className="text-lg flex-shrink-0">{action.icon}</span>}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{action.label}</p>
                  <p className="text-xs text-gray-400">+{action.points_value} {unitLabel}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Toggle */}
                <button
                  onClick={() => handleToggle(action)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    action.is_active ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                  title={action.is_active ? 'Désactiver' : 'Activer'}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    action.is_active ? 'left-[18px]' : 'left-0.5'
                  }`} />
                </button>
                {/* Edit */}
                <button
                  onClick={() => startEdit(action)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Modifier"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                {/* Delete */}
                <button
                  onClick={() => handleDelete(action.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  title="Supprimer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
