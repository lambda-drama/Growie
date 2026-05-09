export interface GroweAppointmentRow {
  name: string
  scheduled_time: string
  status: string
  customer_name: string
  customer_phone_number: string
  customer_skype: string
  customer_email: string
  customer_details: string
  google_link: string
  coach: string
  creation?: string
}

function getCSRF(): string {
  return (window as unknown as Record<string, string>).csrf_token ?? ''
}

function postHeaders(): HeadersInit {
  const csrf = getCSRF()
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
  }
}

function parseError(data: Record<string, unknown>): string {
  if (data._server_messages) {
    try {
      const arr = JSON.parse(String(data._server_messages)) as string[]
      if (arr[0]) {
        const o = JSON.parse(arr[0]) as { message?: string }
        return o.message ?? 'Request failed'
      }
    } catch {
      /* */
    }
  }
  if (data.exc && typeof data.exc === 'string') {
    const lines = data.exc.trim().split('\n').filter(Boolean)
    return lines[lines.length - 1] ?? 'Request failed'
  }
  if (typeof data.message === 'string') return data.message
  return 'Request failed'
}

export async function fetchCoachingAccess(): Promise<{ eligible: boolean; tier: string }> {
  const res = await fetch('/api/method/growie_app.api.appointments.coaching_access', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = (await res.json()) as { message?: { eligible?: boolean; tier?: string }; exc?: string }
  if (!res.ok || data.exc) throw new Error(parseError(data as unknown as Record<string, unknown>))
  const m = data.message ?? {}
  return {
    eligible: Boolean(m.eligible),
    tier: typeof m.tier === 'string' ? m.tier : 'free',
  }
}

export async function fetchMyAppointments(): Promise<GroweAppointmentRow[]> {
  const res = await fetch('/api/method/growie_app.api.appointments.my_appointments', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = (await res.json()) as { message?: GroweAppointmentRow[]; exc?: string }
  if (!res.ok || data.exc) throw new Error(parseError(data as unknown as Record<string, unknown>))
  return Array.isArray(data.message) ? data.message : []
}

export interface BookAppointmentInput {
  /** ISO datetime string understood by Frappe (`get_datetime`) */
  scheduledTimeIso: string
  customerPhone?: string
  customerSkype?: string
  customerAltEmail?: string
  customerDetails?: string
}

export async function bookAppointment(input: BookAppointmentInput): Promise<GroweAppointmentRow> {
  const res = await fetch('/api/method/growie_app.api.appointments.book_appointment', {
    method: 'POST',
    headers: postHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      scheduled_time: input.scheduledTimeIso,
      customer_phone_number: input.customerPhone ?? '',
      customer_skype: input.customerSkype ?? '',
      customer_email: input.customerAltEmail ?? '',
      customer_details: input.customerDetails ?? '',
    }),
  })
  const data = (await res.json()) as { message?: GroweAppointmentRow; exc?: string }
  if (!res.ok || data.exc) throw new Error(parseError(data as unknown as Record<string, unknown>))
  if (!data.message) throw new Error('No appointment returned')
  return data.message
}
