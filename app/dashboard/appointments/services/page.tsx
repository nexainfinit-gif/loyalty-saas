'use client'

import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, X, Clock, Euro, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react'
import type { Service } from '@/types/appointments'
import { api } from '@/lib/use-api'

const CATEGORIES = ['Coupe', 'Coiffure', 'Couleur', 'Barbe', 'Soin', 'Massage', 'Autre']

const emptyForm = {
  name: '',
  duration_minutes: 30,
  price: 0,
  category: 'Coupe',
  active: true,
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function fetch() {
      const res = await api<{ services: Service[] }>('/api/appointments/services')
      if (res.data) setServices(res.data.services)
      setLoading(false)
    }
    fetch()
  }, [])

  const filteredServices =
    filterCategory === 'all'
      ? services
      : services.filter((s) => s.category === filterCategory)

  const categories = ['all', ...new Set(services.map((s) => s.category))]

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (service: Service) => {
    setEditingId(service.id)
    setForm({
      name: service.name,
      duration_minutes: service.duration_minutes,
      price: service.price,
      category: service.category,
      active: service.active,
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    if (editingId) {
      const res = await api<{ service: Service }>('/api/appointments/services', {
        method: 'PUT',
        body: JSON.stringify({ id: editingId, ...form }),
      })
      if (res.data) {
        setServices((prev) =>
          prev.map((s) => (s.id === editingId ? res.data!.service : s))
        )
      }
    } else {
      const res = await api<{ service: Service }>('/api/appointments/services', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      if (res.data) {
        setServices((prev) => [...prev, res.data!.service])
      }
    }
    setSaving(false)
    setShowForm(false)
  }

  const toggleActive = async (id: string) => {
    const service = services.find((s) => s.id === id)
    if (!service) return
    const res = await api<{ service: Service }>('/api/appointments/services', {
      method: 'PUT',
      body: JSON.stringify({ id, active: !service.active }),
    })
    if (res.data) {
      setServices((prev) =>
        prev.map((s) => (s.id === id ? res.data!.service : s))
      )
    }
  }

  const deleteService = async (id: string) => {
    const res = await api('/api/appointments/services?id=' + id, { method: 'DELETE' })
    if (!res.error) {
      setServices((prev) => prev.filter((s) => s.id !== id))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Services</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gérez les prestations proposées par votre établissement
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-3 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <Plus size={16} />
          Ajouter un service
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 ${
              filterCategory === cat
                ? 'bg-gray-900 text-white'
                : 'bg-gray-50 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {cat === 'all' ? 'Tous' : cat}
          </button>
        ))}
      </div>

      {/* Services grid */}
      {filteredServices.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">
          Aucun service. Cliquez sur "Ajouter un service" pour commencer.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredServices.map((service) => (
            <div
              key={service.id}
              className={`bg-white rounded-xl border border-gray-200 p-5 transition-all duration-200 hover:border-gray-300 ${
                !service.active ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold">{service.name}</p>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-50 text-gray-400 mt-1 inline-block">
                    {service.category}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(service)}
                    className="w-7 h-7 rounded-lg hover:bg-gray-50 flex items-center justify-center transition-colors"
                  >
                    <Pencil size={13} className="text-gray-400" />
                  </button>
                  <button
                    onClick={() => deleteService(service.id)}
                    className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors"
                  >
                    <Trash2 size={13} className="text-red-400" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Clock size={13} />
                  {service.duration_minutes} min
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Euro size={13} />
                  {service.price}
                </div>
              </div>

              <button
                onClick={() => toggleActive(service.id)}
                className="flex items-center gap-2 mt-3 text-xs"
              >
                {service.active ? (
                  <ToggleRight size={20} className="text-green-500" />
                ) : (
                  <ToggleLeft size={20} className="text-gray-400" />
                )}
                <span className={service.active ? 'text-green-600' : 'text-gray-400'}>
                  {service.active ? 'Actif' : 'Inactif'}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold">
                {editingId ? 'Modifier le service' : 'Nouveau service'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-9 h-9 rounded-lg hover:bg-gray-50 flex items-center justify-center transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                  Nom du service
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="ex: Coupe homme"
                  className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors placeholder:text-gray-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                    Durée (min)
                  </label>
                  <input
                    type="number"
                    value={form.duration_minutes}
                    onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) || 0 })}
                    required
                    min={5}
                    step={5}
                    className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                    Prix (€)
                  </label>
                  <input
                    type="number"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                    required
                    min={0}
                    step={0.5}
                    className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">
                  Catégorie
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors bg-white"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-3 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {editingId ? 'Enregistrer' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
