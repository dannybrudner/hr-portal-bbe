'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase, OfficeDay, CalendarEvent, Profile } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import toast from 'react-hot-toast'
import { ChevronLeft, ChevronRight, Plus, X, Building2 } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday, addMonths, subMonths } from 'date-fns'
import { getHoliday } from '@/lib/israeliHolidays'

const HEBREW_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
const HEBREW_MONTHS: Record<number, string> = {
  0:'ינואר',1:'פברואר',2:'מרץ',3:'אפריל',4:'מאי',5:'יוני',
  6:'יולי',7:'אוגוסט',8:'ספטמבר',9:'אוקטובר',10:'נובמבר',11:'דצמבר'
}

export default function DashboardPage() {
  const { user, profile } = useAuth()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [officeDays, setOfficeDays] = useState<OfficeDay[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [allProfiles, setAllProfiles] = useState<Record<string, Profile>>({})
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [newEventTitle, setNewEventTitle] = useState('')
  const [newEventDate, setNewEventDate] = useState('')
  const [loading, setLoading] = useState(false)

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startPad = (getDay(monthStart) + 1) % 7 // Sun=1, adjust for Hebrew (Sat first? No - use Sun-Sat with Sun=0)

  const fetchData = useCallback(async () => {
    const monthStr = format(currentDate, 'yyyy-MM')
    const [{ data: od }, { data: ev }, { data: pr }] = await Promise.all([
      supabase.from('office_days').select('*, profiles(*)').gte('date', monthStr + '-01').lte('date', monthStr + '-31'),
      supabase.from('calendar_events').select('*').gte('date', monthStr + '-01').lte('date', monthStr + '-31'),
      supabase.from('profiles').select('*'),
    ])
    setOfficeDays(od || [])
    setEvents(ev || [])
    if (pr) {
      const map: Record<string, Profile> = {}
      pr.forEach((p: Profile) => { map[p.id] = p })
      setAllProfiles(map)
    }
  }, [currentDate])

  useEffect(() => { fetchData() }, [fetchData])

  async function toggleOfficeDay(date: Date) {
    if (!user) return
    const dateStr = format(date, 'yyyy-MM-dd')
    const existing = officeDays.find(od => od.date === dateStr && od.user_id === user.id)
    if (existing) {
      await supabase.from('office_days').delete().eq('id', existing.id)
      toast.success('Removed office day')
    } else {
      await supabase.from('office_days').insert({ user_id: user.id, date: dateStr })
      toast.success('Marked as office day! 🏢')
    }
    fetchData()
  }

  async function addEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!newEventTitle || !newEventDate) return
    setLoading(true)
    await supabase.from('calendar_events').insert({ title: newEventTitle, date: newEventDate, created_by: user!.id })
    toast.success('Event added')
    setNewEventTitle('')
    setNewEventDate('')
    setShowAddEvent(false)
    fetchData()
    setLoading(false)
  }

  async function deleteEvent(id: string) {
    await supabase.from('calendar_events').delete().eq('id', id)
    toast.success('Event removed')
    fetchData()
  }

  function getDayOfficePeople(date: Date) {
    const dateStr = format(date, 'yyyy-MM-dd')
    return officeDays.filter(od => od.date === dateStr)
  }

  function getDayEvents(date: Date) {
    const dateStr = format(date, 'yyyy-MM-dd')
    return events.filter(ev => ev.date === dateStr)
  }

  

  function isMeInOffice(date: Date) {
    const dateStr = format(date, 'yyyy-MM-dd')
    return officeDays.some(od => od.date === dateStr && od.user_id === user?.id)
  }

  const isSat = (d: Date) => getDay(d) === 6

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <div className="section-title">לוח שנה</div>
          <div className="section-subtitle">לחץ על יום לסימון עבודה מהמשרד • לחץ על + להוספת אירוע</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button className="btn-secondary" onClick={() => setCurrentDate(subMonths(currentDate, 1))} style={{ padding: '0.5rem 0.75rem' }}>
            <ChevronRight size={16} />
          </button>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: '700', fontSize: '18px', minWidth: '160px', textAlign: 'center' }}>
            {HEBREW_MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
          </span>
          <button className="btn-secondary" onClick={() => setCurrentDate(addMonths(currentDate, 1))} style={{ padding: '0.5rem 0.75rem' }}>
            <ChevronLeft size={16} />
          </button>
          {profile?.role === 'manager' && (
            <button className="btn-primary" onClick={() => setShowAddEvent(true)} style={{ padding: '0.5rem 1rem' }}>
              <Plus size={16} /> אירוע
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'var(--accent)', opacity: 0.7 }}></div>
          Office day (you)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--accent)' }}></div>
          Today
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <Building2 size={10} style={{ color: 'var(--accent-light)' }} />
          Colleagues in office
        </div>
      </div>

      {/* Calendar grid */}
      <div className="card" style={{ padding: '1rem' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} style={{
              textAlign: 'center', fontSize: '11px', fontWeight: '600',
              color: d === 'Sat' ? 'var(--accent)' : 'var(--text-muted)',
              padding: '0.4rem 0',
            }}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {/* Padding empty cells */}
          {Array.from({ length: getDay(monthStart) }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}

          {days.map(day => {
            const officePeople = getDayOfficePeople(day)
            const dayEvents = getDayEvents(day)
            const holiday = getHoliday(format(day, 'yyyy-MM-dd'))
            const meInOffice = isMeInOffice(day)
            const sat = isSat(day)

            return (
              <div
                key={day.toISOString()}
                className={`cal-day ${isToday(day) ? 'today' : ''} ${sat ? 'shabbat' : ''}`}
                style={{ background: meInOffice && !isToday(day) ? 'rgba(201,146,74,0.1)' : undefined }}
                onClick={() => !sat && toggleOfficeDay(day)}
                title={sat ? 'שבת' : 'Click to toggle office day'}
              >
                <div className="cal-day-num" style={{ color: sat ? 'var(--accent)' : undefined }}>
                  {format(day, 'd')}
                </div>
                {holiday && (
                  <div style={{ fontSize: '9px', color: 'var(--accent-light)', textAlign: 'center', lineHeight: 1.2, fontWeight: '600' }}>
                    {holiday}
                  </div>
                )}
                {dayEvents.map(ev => (
                  <div key={ev.id} style={{
                    fontSize: '9px', background: 'var(--accent-muted)', color: 'var(--accent-light)',
                    borderRadius: '4px', padding: '1px 4px', width: '100%', textAlign: 'center',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {ev.title}
                  </div>
                ))}
                {officePeople.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center' }}>
                    {officePeople.slice(0, 3).map(od => {
                      const p = allProfiles[od.user_id]
                      const initials = (p as any)?.first_name_he || 
                        (p?.full_name ? p.full_name.split(' ')[0] : null) || 
                        (p?.email ? p.email.split('@')[0] : '•')
                      return (
                        <div key={od.id} title={p?.full_name || ''} style={{
                          borderRadius: '4px',
                          background: od.user_id === user?.id ? 'var(--accent)' : 'var(--accent-muted)',
                          border: '1px solid var(--border-accent)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: '1px 4px',
                          fontSize: '9px', fontWeight: '700',
                          color: od.user_id === user?.id ? '#1a1000' : 'var(--accent-light)',
                          whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{initials}</div>
                      )
                    })}
                    {officePeople.length > 3 && (
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>+{officePeople.length - 3}</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Add Event Modal */}
      {showAddEvent && (
        <div className="modal-overlay">
          <div className="modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '18px', fontWeight: '700' }}>Add Company Event</h2>
              <button onClick={() => setShowAddEvent(false)} className="btn-secondary" style={{ padding: '0.4rem' }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={addEvent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label>Event Title</label>
                <input className="input" placeholder="e.g. Team lunch, Company meeting" value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} required />
              </div>
              <div>
                <label>Date</label>
                <input className="input" type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)} required />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Adding...' : 'Add Event'}</button>
                <button type="button" className="btn-secondary" onClick={() => setShowAddEvent(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
