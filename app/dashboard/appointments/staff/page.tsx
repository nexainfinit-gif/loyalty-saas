'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, X, ToggleLeft, ToggleRight, Clock, Scissors } from 'lucide-react'
import type { StaffMember, StaffAvailability } from '@/types/appointments'

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const DAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

const SERVICES_LIST = [
  { id: 's1', name: 'Coupe homme' },
  { id: 's2', name: 'Coupe femme' },
  { id: 's3', name: 'Brushing' },
  { id: 's4', name: 'Couleur complète' },
  { id: 's5', name: 'Mèches / Balayage' },
  { id: 's6', name: 'Barbe' },
  { id: 's7', name: 'Soin visage' },
  { id: 's8', name: 'Massage crânien' },
]

const INITIAL_STAFF: StaffMember[] = [
  { id: 'st1', restaurant_id: 'b1', name: 'Sophie Martin', email: 'sophie@salon.be', phone: '0470 11 22 33', avatar_url: null, service_ids: ['s1', 's2', 's3', 's4'], active: true, created_at: '' },
  { id: 'st2', restaurant_id: 'b1', name: 'Lucas Dubois', email: 'lucas@salon.be', phone: '0475 44 55 66', avatar_url: null, service_ids: ['s1', 's3', 's6', 's8'], active: true, created_at: '' },
  { id: 'st3', restaurant_id: 'b1', name: 'Emma Laurent', email: 'emma@salon.be', phone: '0486 77 88 99', avatar_url: null, service_ids: ['s2', 's3', 's4', 's5', 's7'], active: true, created_at: '' },
]

const INITIAL_AVAILABILITY: Record<string, StaffAvailability[]> = {
  st1: [1, 2, 3, 4, 5, 6].map((day) => ({
    id: `av-st1-${day}`,
    staff_id: 'st1',
    restaurant_id: 'b1',
    day_of_week: day,
    start_time: '09:00',
    end_time: day === 6 ? '14:00' : '18:00',
    is_working: true,
  })),
  st2: [1, 2, 3, 4, 5].map((day) => ({
    id: `av-st2-${day}`,
    staff_id: 'st2',
    restaurant_id: 'b1',
    day_of_week: day,
    start_time: '10:00',
    end_time: '19:00',
    is_working: true,
  })),
  st3: [1, 2, 4, 5, 6].map((day) => ({
    id: `av-st3-${day}`,
    staff_id: 'st3',
    restaurant_id: 'b1',
    day_of_week: day,
    start_time: '09:00',
    end_time: '17:00',
    is_working: true,
  })),
}

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  service_ids: [] as string[],
  active: true,
}

type ModalView = 'list' | 'form' | 'schedule'

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>(INITIAL_STAFF)
  const [availability, setAvailability] = useState(INITIAL_AVAILABILITY)
  const [modalView, setModalView] = useState<ModalView>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [scheduleStaffId, setScheduleStaffId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setModalView('form')
  }

  const openEdit = (member: StaffMember) => {
    setEditingId(member.id)
    setForm({
      name: member.name,
      email: member.email,
      phone: member.phone || '',
      service_ids: member.service_ids,
      active: member.active,
    })
    setModalView('form')
  }

  const openSchedule = (memberId: string) => {
    setScheduleStaffId(memberId)
    setModalView('schedule')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingId) {
      setStaff((prev) =>
        prev.map((s) =>
          s.id === editingId ? { ...s, ...form } : s
        )
      )
    } else {
      const id = `st${Date.now()}`
      const newMember: StaffMember = {
        id,
        restaurant_id: 'b1',
        ...form,
        avatar_url: null,
        created_at: new Date().toISOString(),
      }
      setStaff((prev) => [...prev, newMember])
      setAvailability((prev) => ({
        ...prev,
        [id]: [1, 2, 3, 4, 5].map((day) => ({
          id: `av-${id}-${day}`,
          staff_id: id,
          restaurant_id: 'b1',
          day_of_week: day,
          start_time: '09:00',
          end_time: '18:00',
          is_working: true,
        })),
      }))
    }
    setModalView('list')
  }

  const toggleActive = (id: string) => {
    setStaff((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s))
    )
  }

  const deleteMember = (id: string) => {
    setStaff((prev) => prev.filter((s) => s.id !== id))
  }

  const toggleService = (serviceId: string) => {
    setForm((prev) => ({
      ...prev,
      service_ids: prev.service_ids.includes(serviceId)
        ? prev.service_ids.filter((sid) => sid !== serviceId)
        : [...prev.service_ids, serviceId],
    }))
  }

  const toggleDayWorking = (staffId: string, dayOfWeek: number) => {
    setAvailability((prev) => {
      const staffAvail = prev[staffId] || []
      const existing = staffAvail.find((a) => a.day_of_week === dayOfWeek)
      if (existing) {
        return {
          ...prev,
          [staffId]: staffAvail.map((a) =>
            a.day_of_week === dayOfWeek ? { ...a, is_working: !a.is_working } : a
          ),
        }
      } else {
        return {
          ...prev,
          [staffId]: [
            ...staffAvail,
            {
              id: `av-${staffId}-${dayOfWeek}`,
              staff_id: staffId,
              restaurant_id: 'b1',
              day_of_week: dayOfWeek,
              start_time: '09:00',
              end_time: '18:00',
              is_working: true,
            },
          ],
        }
      }
    })
  }

  const updateDayTime = (staffId: string, dayOfWeek: number, field: 'start_time' | 'end_time', value: string) => {
    setAvailability((prev) => ({
      ...prev,
      [staffId]: (prev[staffId] || []).map((a) =>
        a.day_of_week === dayOfWeek ? { ...a, [field]: value } : a
      ),
    }))
  }

  const scheduleStaff = scheduleStaffId ? staff.find((s) => s.id === scheduleStaffId) : null

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gérez votre équipe et leurs horaires de travail
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <Plus size={16} />
          Ajouter un employé
        </button>
      </div>

      {/* Staff cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {staff.map((member) => {
          const memberAvail = availability[member.id] || []

          return (
            <div
              key={member.id}
              className={`bg-white rounded-xl border border-gray-200 p-5 transition-all duration-200 hover:border-gray-300 ${
                !member.active ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
                    <span className="text-sm font-semibold text-gray-500">
                      {member.name.split(' ').map((n) => n[0]).join('')}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{member.name}</p>
                    <p className="text-[11px] text-gray-400">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(member)}
                    className="w-7 h-7 rounded-lg hover:bg-gray-50 flex items-center justify-center transition-colors"
                  >
                    <Pencil size={13} className="text-gray-400" />
                  </button>
                  <button
                    onClick={() => deleteMember(member.id)}
                    className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors"
                  >
                    <Trash2 size={13} className="text-red-400" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
                <Scissors size={13} />
                {member.service_ids.length} services autorisés
              </div>

              <div className="flex gap-1 mb-3">
                {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                  const isWorking = memberAvail.some(
                    (a) => a.day_of_week === day && a.is_working
                  )
                  return (
                    <span
                      key={day}
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        isWorking
                          ? 'bg-green-50 text-green-600'
                          : 'bg-gray-50 text-gray-400'
                      }`}
                    >
                      {DAYS_SHORT[day]}
                    </span>
                  )
                })}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <button
                  onClick={() => toggleActive(member.id)}
                  className="flex items-center gap-2 text-xs"
                >
                  {member.active ? (
                    <ToggleRight size={20} className="text-green-500" />
                  ) : (
                    <ToggleLeft size={20} className="text-gray-400" />
                  )}
                  <span className={member.active ? 'text-green-600' : 'text-gray-400'}>
                    {member.active ? 'Actif' : 'Inactif'}
                  </span>
                </button>

                <button
                  onClick={() => openSchedule(member.id)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <Clock size={13} />
                  Horaires
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Staff form modal */}
      {modalView === 'form' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setModalView('list')} />
          <div className="relative bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold">
                {editingId ? 'Modifier l\'employé' : 'Nouvel employé'}
              </h2>
              <button
                onClick={() => setModalView('list')}
                className="w-8 h-8 rounded-lg hover:bg-gray-50 flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Nom complet</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="Sophie Martin"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors placeholder:text-gray-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Téléphone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-900 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">
                  Services autorisés
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SERVICES_LIST.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => toggleService(service.id)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium text-left transition-all duration-200 ${
                        form.service_ids.includes(service.id)
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-50 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {service.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalView('list')}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
                >
                  {editingId ? 'Enregistrer' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule modal */}
      {modalView === 'schedule' && scheduleStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setModalView('list')} />
          <div className="relative bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-semibold">Horaires de {scheduleStaff.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Définissez les jours et heures de travail
                </p>
              </div>
              <button
                onClick={() => setModalView('list')}
                className="w-8 h-8 rounded-lg hover:bg-gray-50 flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-2">
              {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                const staffAvail = availability[scheduleStaff.id] || []
                const dayAvail = staffAvail.find((a) => a.day_of_week === day)
                const isWorking = dayAvail?.is_working ?? false

                return (
                  <div
                    key={day}
                    className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-colors ${
                      isWorking ? 'bg-gray-50' : ''
                    }`}
                  >
                    <button
                      onClick={() => toggleDayWorking(scheduleStaff.id, day)}
                      className="shrink-0"
                    >
                      {isWorking ? (
                        <ToggleRight size={22} className="text-green-500" />
                      ) : (
                        <ToggleLeft size={22} className="text-gray-400" />
                      )}
                    </button>
                    <span className={`text-sm font-medium w-24 ${!isWorking ? 'text-gray-400' : ''}`}>
                      {DAYS[day]}
                    </span>
                    {isWorking && dayAvail ? (
                      <div className="flex items-center gap-2 ml-auto">
                        <input
                          type="time"
                          value={dayAvail.start_time}
                          onChange={(e) => updateDayTime(scheduleStaff.id, day, 'start_time', e.target.value)}
                          className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-gray-900"
                        />
                        <span className="text-xs text-gray-400">–</span>
                        <input
                          type="time"
                          value={dayAvail.end_time}
                          onChange={(e) => updateDayTime(scheduleStaff.id, day, 'end_time', e.target.value)}
                          className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-gray-900"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 ml-auto">Repos</span>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => setModalView('list')}
                className="w-full px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
