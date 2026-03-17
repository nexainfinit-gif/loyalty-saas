import { google } from 'googleapis';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

const CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL}/api/gcal/callback`;

function getOAuth2Client() {
  if (!CLIENT_ID || !CLIENT_SECRET) return null;
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

/** Generate the OAuth consent URL for a restaurant owner. */
export function getAuthUrl(state: string): string | null {
  const client = getOAuth2Client();
  if (!client) return null;

  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state,
  });
}

/** Exchange authorization code for tokens and store refresh_token. */
export async function handleCallback(code: string, restaurantId: string): Promise<boolean> {
  const client = getOAuth2Client();
  if (!client) return false;

  try {
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      logger.error({ ctx: 'gcal', msg: 'No refresh_token returned' });
      return false;
    }

    await supabaseAdmin
      .from('restaurants')
      .update({
        google_calendar_enabled: true,
        google_calendar_refresh_token: tokens.refresh_token,
      })
      .eq('id', restaurantId);

    return true;
  } catch (err) {
    logger.error({ ctx: 'gcal', msg: 'Token exchange failed', err: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/** Get an authenticated Calendar client for a restaurant. */
async function getCalendarClient(restaurantId: string) {
  const client = getOAuth2Client();
  if (!client) return null;

  const { data: resto } = await supabaseAdmin
    .from('restaurants')
    .select('google_calendar_enabled, google_calendar_refresh_token, google_calendar_id')
    .eq('id', restaurantId)
    .single();

  if (!resto?.google_calendar_enabled || !resto.google_calendar_refresh_token) return null;

  client.setCredentials({ refresh_token: resto.google_calendar_refresh_token });

  return {
    calendar: google.calendar({ version: 'v3', auth: client }),
    calendarId: resto.google_calendar_id || 'primary',
  };
}

/** Create a Google Calendar event for an appointment. */
export async function syncAppointmentToCalendar(appointmentId: string, restaurantId: string): Promise<void> {
  const ctx = await getCalendarClient(restaurantId);
  if (!ctx) return;

  const { data: apt } = await supabaseAdmin
    .from('appointments')
    .select('id, date, start_time, end_time, client_name, client_email, client_phone, notes, service:services(name), staff:staff_members(name)')
    .eq('id', appointmentId)
    .single();

  if (!apt) return;

  const service = apt.service as unknown as { name: string } | null;
  const staff = apt.staff as unknown as { name: string } | null;

  const startDateTime = `${apt.date}T${apt.start_time}:00`;
  const endDateTime = `${apt.date}T${apt.end_time}:00`;

  try {
    const event = await ctx.calendar.events.insert({
      calendarId: ctx.calendarId,
      requestBody: {
        summary: `${service?.name ?? 'RDV'} — ${apt.client_name}`,
        description: [
          `Client : ${apt.client_name}`,
          apt.client_email ? `Email : ${apt.client_email}` : '',
          apt.client_phone ? `Tél : ${apt.client_phone}` : '',
          staff?.name ? `Avec : ${staff.name}` : '',
          apt.notes ? `Notes : ${apt.notes}` : '',
        ].filter(Boolean).join('\n'),
        start: { dateTime: startDateTime, timeZone: 'Europe/Brussels' },
        end: { dateTime: endDateTime, timeZone: 'Europe/Brussels' },
        reminders: { useDefault: true },
      },
    });

    if (event.data.id) {
      await supabaseAdmin
        .from('appointments')
        .update({ google_calendar_event_id: event.data.id })
        .eq('id', appointmentId);
    }
  } catch (err) {
    logger.error({ ctx: 'gcal', msg: `Failed to create event for apt ${appointmentId}`, err: err instanceof Error ? err.message : String(err) });
  }
}

/** Update or delete a Google Calendar event when appointment status changes. */
export async function updateCalendarEvent(appointmentId: string, restaurantId: string, status: string): Promise<void> {
  const ctx = await getCalendarClient(restaurantId);
  if (!ctx) return;

  const { data: apt } = await supabaseAdmin
    .from('appointments')
    .select('google_calendar_event_id')
    .eq('id', appointmentId)
    .single();

  if (!apt?.google_calendar_event_id) return;

  try {
    if (status === 'cancelled') {
      await ctx.calendar.events.delete({
        calendarId: ctx.calendarId,
        eventId: apt.google_calendar_event_id,
      });
      await supabaseAdmin
        .from('appointments')
        .update({ google_calendar_event_id: null })
        .eq('id', appointmentId);
    } else if (status === 'completed') {
      await ctx.calendar.events.patch({
        calendarId: ctx.calendarId,
        eventId: apt.google_calendar_event_id,
        requestBody: {
          colorId: '10', // Green
          summary: (await getEventSummary(appointmentId)) + ' ✓',
        },
      });
    } else if (status === 'no_show') {
      await ctx.calendar.events.patch({
        calendarId: ctx.calendarId,
        eventId: apt.google_calendar_event_id,
        requestBody: {
          colorId: '11', // Red
          summary: (await getEventSummary(appointmentId)) + ' (absent)',
        },
      });
    }
  } catch (err) {
    logger.error({ ctx: 'gcal', msg: `Failed to update event for apt ${appointmentId}`, err: err instanceof Error ? err.message : String(err) });
  }
}

async function getEventSummary(appointmentId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('appointments')
    .select('client_name, service:services(name)')
    .eq('id', appointmentId)
    .single();

  if (!data) return 'RDV';
  const svc = data.service as unknown as { name: string } | null;
  return `${svc?.name ?? 'RDV'} — ${data.client_name}`;
}

/** Disconnect Google Calendar for a restaurant. */
export async function disconnectCalendar(restaurantId: string): Promise<void> {
  await supabaseAdmin
    .from('restaurants')
    .update({
      google_calendar_enabled: false,
      google_calendar_refresh_token: null,
    })
    .eq('id', restaurantId);
}
