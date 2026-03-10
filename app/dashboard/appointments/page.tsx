'use client'

import { useState, useMemo } from 'react'
import { format, addMinutes, parse } from 'date-fns'
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

// ═══ DEMO DATA ═══
const DEMO_SERVICES: Service[] = [
  { id: 's1', restaurant_id: 'b1', name: 'Coupe homme', duration_minutes: 30, price: 25, category: 'Coupe', active: true, created_at: '' },
  { id: 's2', restaurant_id: 'b1', name: 'Coupe femme', duration_minutes: 45, price: 35, category: 'Coupe', active: true, created_at: '' },
  { id: 's3', restaurant_id: 'b1', name: 'Brushing', duration_minutes: 30, price: 20, category: 'Coiffure', active: true, created_at: '' },
  { id: 's4', restaurant_id: 'b1', name: 'Couleur', duration_minutes: 90, price: 65, category: 'Couleur', active: true, created_at: '' },
  { id: 's5', restaurant_id: 'b1', name: 'Barbe', duration_minutes: 20, price: 15, category: 'Barbe', active: true, created_at: '' },
  { id: 's6', restaurant_id: 'b1', name: 'Soin visage', duration_minutes: 60, price: 50, category: 'Soin', active: true, created_at: '' },
  { id: 's7', restaurant_id: 'b1', name: 'Massage crânien', duration_minutes: 20, price: 18, category: 'Soin', active: true, created_at: '' },
]

const DEMO_STAFF: StaffMember[] = [
  { id: 'st1', restaurant_id: 'b1', name: 'Sophie Martin', email: 'sophie@salon.be', phone: null, avatar_url: null, service_ids: ['s1', 's2', 's3', 's4'], active: true, created_at: '' },
  { id: 'st2', restaurant_id: 'b1', name: 'Lucas Dubois', email: 'lucas@salon.be', phone: null, avatar_url: null, service_ids: ['s1', 's3', 's5', 's7'], active: true, created_at: '' },
  { id: 'st3', restaurant_id: 'b1', name: 'Emma Laurent', email: 'emma@salon.be', phone: null, avatar_url: null, service_ids: ['s2', 's3', 's4', 's6'], active: true, created_at: '' },
]

const today = format(new Date(), 'yyyy-MM-dd')

const DEMO_APPOINTMENTS: Appointment[] = [
  { id: 'a1', restaurant_id: 'b1', client_id: null, staff_id: 'st1', service_id: 's2', date: today, start_time: '09:00', end_time: '09:45', status: 'confirmed', client_name: 'Marie Leroy', client_email: 'marie@email.com', client_phone: '0470 12 34 56', notes: null, created_at: '', service: DEMO_SERVICES[1], staff: DEMO_STAFF[0] },
  { id: 'a2', restaurant_id: 'b1', client_id: null, staff_id: 'st1', service_id: 's4', date: today, start_time: '10:00', end_time: '11:30', status: 'confirmed', client_name: 'Julie Petit', client_email: 'julie@email.com', client_phone: '0475 98 76 54', notes: 'Couleur blonde cendrée', created_at: '', service: DEMO_SERVICES[3], staff: DEMO_STAFF[0] },
  { id: 'a3', restaurant_id: 'b1', client_id: null, staff_id: 'st2', service_id: 's1', date: today, start_time: '09:30', end_time: '10:00', status: 'confirmed', client_name: 'Thomas Bernard', client_email: '', client_phone: '0486 55 44 33', notes: null, created_at: '', service: DEMO_SERVICES[0], staff: DEMO_STAFF[1] },
  { id: 'a4', restaurant_id: 'b1', client_id: null, staff_id: 'st2', service_id: 's5', date: today, start_time: '10:30', end_time: '10:50', status: 'completed', client_name: 'Antoine Moreau', client_email: '', client_phone: '', notes: null, created_at: '', service: DEMO_SERVICES[4], staff: DEMO_STAFF[1] },
  { id: 'a5', restaurant_id: 'b1', client_id: null, staff_id: 'st3', service_id: 's6', date: today, start_time: '11:00', end_time: '12:00', status: 'confirmed', client_name: 'Camille Roux', client_email: 'camille@email.com', client_phone: '0495 11 22 33', notes: 'Peau sensible', created_at: '', service: DEMO_SERVICES[5], staff: DEMO_STAFF[2] },
  { id: 'a6', restaurant_id: 'b1', client_id: null, staff_id: 'st1', service_id: 's3', date: today, start_time: '14:00', end_time: '14:30', status: 'confirmed', client_name: 'Léa Simon', client_email: '', client_phone: '', notes: null, created_at: '', service: DEMO_SERVICES[2], staff: DEMO_STAFF[0] },
  { id: 'a7', restaurant_id: 'b1', client_id: null, staff_id: 'st3', service_id: 's2', date: today, start_time: '14:30', end_time: '15:15', status: 'confirmed', client_name: 'Clara Fontaine', client_email: 'clara@email.com', client_phone: '', notes: null, created_at: '', service: DEMO_SERVICES[1], staff: DEMO_STAFF[2] },
  { id: 'a8', restaurant_id: 'b1', client_id: null, staff_id: 'st2', service_id: 's1', date: today, start_time: '15:00', end_time: '15:30', status: 'no_show', client_name: 'Pierre Dumont', client_email: '', client_phone: '0477 88 99 00', notes: null, created_at: '', service: DEMO_SERVICES[0], staff: DEMO_STAFF[1] },
]

export default function AgendaPage() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [view, setView] = useState<CalendarViewType>('day')
  const [appointments, setAppointments] = useState<Appointment[]>(DEMO_APPOINTMENTS)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [createDefaults, setCreateDefaults] = useState<{
    staffId?: string
    date?: Date
    time?: string
  }>({})

  const handleCreateAppointment = (staffId: string, date: Date, time: string) => {
    setCreateDefaults({ staffId, date, time })
    setShowCreateModal(true)
  }

  const handleSubmitAppointment = (data: {
    service_id: string
    staff_id: string
    date: string
    start_time: string
    client_name: string
    client_email: string
    client_phone: string
    notes: string
  }) => {
    const service = DEMO_SERVICES.find((s) => s.id === data.service_id)
    const staffMember = DEMO_STAFF.find((s) => s.id === data.staff_id)
    const startDate = parse(data.start_time, 'HH:mm', new Date())
    const endTime = format(addMinutes(startDate, service?.duration_minutes || 30), 'HH:mm')

    const newAppointment: Appointment = {
      id: `a${Date.now()}`,
      restaurant_id: 'b1',
      client_id: null,
      staff_id: data.staff_id,
      service_id: data.service_id,
      date: data.date,
      start_time: data.start_time,
      end_time: endTime,
      status: 'confirmed',
      client_name: data.client_name,
      client_email: data.client_email,
      client_phone: data.client_phone,
      notes: data.notes || null,
      created_at: new Date().toISOString(),
      service,
      staff: staffMember,
    }

    setAppointments((prev) => [...prev, newAppointment])
  }

  const handleStatusChange = (id: string, status: AppointmentStatus) => {
    setAppointments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    )
    setSelectedAppointment(null)
  }

  return (
    <div>
      {/* Calendar — takes full available height */}
      <CalendarView
        appointments={appointments}
        staff={DEMO_STAFF}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        view={view}
        onViewChange={setView}
        onCreateAppointment={handleCreateAppointment}
        onAppointmentClick={setSelectedAppointment}
        onNewAppointment={() => { setCreateDefaults({}); setShowCreateModal(true) }}
      />

      {/* Create Modal */}
      <CreateAppointmentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleSubmitAppointment}
        services={DEMO_SERVICES}
        staff={DEMO_STAFF}
        initialStaffId={createDefaults.staffId}
        initialDate={createDefaults.date}
        initialTime={createDefaults.time}
      />

      {/* Detail Modal */}
      <AppointmentDetailModal
        appointment={selectedAppointment}
        onClose={() => setSelectedAppointment(null)}
        onStatusChange={handleStatusChange}
      />
    </div>
  )
}
