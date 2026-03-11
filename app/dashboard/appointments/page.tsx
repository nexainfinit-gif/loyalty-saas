'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { toast } from 'sonner'
import CalendarView from '@/components/appointments/CalendarView'
import CreateAppointmentModal from '@/components/appointments/CreateModal'
import AppointmentDetailModal from '@/components/appointments/DetailModal'
import type {
  Appointment,
  StaffMember,
  Service,
  CalendarView as CalendarViewType,
  AppointmentStatus,
} from '@/types/appointments'
import { api } from '@/lib/use-api'
import { useSubscriptionGate } from '@/lib/use-subscription-gate'

export default function AgendaPage() {
  const { ready: subReady } = useSubscriptionGate()
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [view, setView] = useState<CalendarViewType>('day')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [createDefaults, setCreateDefaults] = useState<{
    staffId?: string
    date?: Date
    time?: string
  }>({})

  // Fetch staff + services once
  useEffect(() => {
    async function fetchRef() {
      const [staffRes, servicesRes] = await Promise.all([
        api<{ staff: StaffMember[] }>('/api/appointments/staff'),
        api<{ services: Service[] }>('/api/appointments/services'),
      ])
      if (staffRes.data) setStaff(staffRes.data.staff)
      if (servicesRes.data) setServices(servicesRes.data.services)
    }
    fetchRef()
  }, [])

  // Fetch appointments when date or view changes
  const fetchAppointments = useCallback(async () => {
    setLoading(true)
    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    let url = `/api/appointments?date=${dateStr}`
    if (view === 'week') {
      const start = dateStr
      const end = format(addDays(selectedDate, 6), 'yyyy-MM-dd')
      url = `/api/appointments?date=${start}&dateEnd=${end}`
    }
    const res = await api<{ appointments: Appointment[] }>(url)
    if (res.data) setAppointments(res.data.appointments)
    setLoading(false)
  }, [selectedDate, view])

  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments])

  const handleCreateAppointment = (staffId: string, date: Date, time: string) => {
    setCreateDefaults({ staffId, date, time })
    setShowCreateModal(true)
  }

  const handleSubmitAppointment = async (data: {
    service_id: string
    staff_id: string
    date: string
    start_time: string
    client_name: string
    client_email: string
    client_phone: string
    notes: string
  }) => {
    const res = await api<{ appointment: Appointment }>('/api/appointments', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (res.data) {
      setAppointments((prev) => [...prev, res.data!.appointment])
      toast.success('Rendez-vous créé')
    }
  }

  const handleStatusChange = async (id: string, status: AppointmentStatus) => {
    const res = await api<{ appointment: Appointment }>('/api/appointments', {
      method: 'PUT',
      body: JSON.stringify({ id, status }),
    })
    if (res.data) {
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? res.data!.appointment : a))
      )
      const labels: Record<string, string> = { completed: 'Terminé', no_show: 'Absent marqué', cancelled: 'Annulé' }
      toast.success(labels[status] || 'Statut mis à jour')
    }
    setSelectedAppointment(null)
  }

  return (
    <div>
      <CalendarView
        appointments={appointments}
        staff={staff}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        view={view}
        onViewChange={setView}
        onCreateAppointment={handleCreateAppointment}
        onAppointmentClick={setSelectedAppointment}
        onNewAppointment={() => { setCreateDefaults({}); setShowCreateModal(true) }}
      />

      <CreateAppointmentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleSubmitAppointment}
        services={services}
        staff={staff}
        initialStaffId={createDefaults.staffId}
        initialDate={createDefaults.date}
        initialTime={createDefaults.time}
      />

      <AppointmentDetailModal
        appointment={selectedAppointment}
        onClose={() => setSelectedAppointment(null)}
        onStatusChange={handleStatusChange}
      />
    </div>
  )
}
