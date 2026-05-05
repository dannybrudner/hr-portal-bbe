'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase, OfficeDay, CalendarEvent, Profile } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import toast from 'react-hot-toast'
import { ChevronLeft, ChevronRight, Plus, X, Pencil, Trash2 } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday, addMonths, subMonths } from 'date-fns'
import { fetchHolidaysForMonth, getHoliday } from '@/lib/israeliHolidays'

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
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [newEventTitle, setNewEventTitle] = useState('')
  const [newEventDate, setNewEventDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [holidayCache, setHolidayCache] = useState<Record<string,string>>({})

  const isManager = profile?.role === 'manager'
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const fetchData = useCallback(async () => {
    const monthStr = format(currentDate, 'yyyy-MM')
    const [{ data: od }, { data: ev }, { data: pr }] = await Promise.all([
      supabase.from('office_days').select('*, profiles(*)').gte('date', monthStr + '-01').lte('date', monthStr + '-31'),
      supabase.from('calendar_events').select('*').gte('date', monthStr + '-01').lte('date', monthStr + '-31').order('date'),
      supabase.from('profiles').select('id, full_name, email, first_name_he, avatar_initials'),
    ])
    setOfficeDays(od || [])
    setEvents(ev || [])
    if (pr) {
      const map: Record<string, Profile> = {}
      pr.forEach((p: any) => { map[p.id] = p })
      setAllProfiles(map)
    }
  }, [currentDate])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const y = currentDate.getFullYear()
    const m = currentDate.getMonth() + 1
    fetchHolidaysForMonth(y, m).then(curr => {
      setHolidayCache(prev => ({ ...prev, ...curr }))
    })
  }, [currentDate])

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

  function openNewEvent() {
    setEditingEvent(null)
    setNewEventTitle('')
    setNewEventDate('')
    setShowAddEvent(true)
  }

  function openEditEvent(ev: CalendarEvent, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingEvent(ev)
    setNewEventTitle(ev.title)
    setNewEventDate(ev.date)
    setShowAddEvent(true)
  }

  async function saveEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!newEventTitle || !newEventDate) return
    setLoading(true)
    if (editingEvent) {
      await supabase.from('calendar_events').update({
        title: newEventTitle, date: newEventDate, updated_at: new Date().toISOString()
      }).eq('id', editingEvent.id)
      toast.success('Event updated')
    } else {
      await supabase.from('calendar_events').insert({
        title: newEventTitle, date: newEventDate, created_by: user!.id, event_type: 'company'
      })
      toast.success('Event added')
    }
    setNewEventTitle(''); setNewEventDate(''); setShowAddEvent(false); setEditingEvent(null)
    fetchData()
    setLoading(false)
  }

  async function deleteEvent(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this event?')) return
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

  // Get display name for a user in the calendar chip
  function getDisplayName(userId: string): string {
    const p = allProfiles[userId] as any
    if (!p) return '?'
    return p.first_name_he || p.full_name?.split(' ')[0] || p.email?.split('@')[0] || '?'
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <div className="section-title">לוח שנה</div>
          <div className="section-subtitle">לחץ על יום לסימון עבודה מהמשרד{isManager && ' • לחץ על + להוספת אירוע'}</div>
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
          {isManager && (
            <button className="btn-primary" onClick={openNewEvent} style={{ padding: '0.5rem 1rem' }}>
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
          <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'var(--accent-muted)', border: '1px solid var(--border-accent)' }}></div>
          Colleague in office
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
          {Array.from({ length: getDay(monthStart) }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}

          {days.map(day => {
            const officePeople = getDayOfficePeople(day)
            const dayEvents = getDayEvents(day)
            const holiday = getHoliday(format(day, 'yyyy-MM-dd'), holidayCache)
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
                    fontSize: '9px', background: ev.event_type === 'birthday' ? 'rgba(255,180,100,0.2)' : 'var(--accent-muted)',
                    color: ev.event_type === 'birthday' ? '#ffb464' : 'var(--accent-light)',
                    borderRadius: '4px', padding: '1px 4px', width: '100%', textAlign: 'center',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'space-between',
                  }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ev.event_type === 'birthday' ? '🎂 ' : ''}{ev.title}
                    </span>
                    {isManager && ev.event_type !== 'birthday' && (
                      <span style={{ display: 'flex', gap: '1px', flexShrink: 0 }}>
                        <span onClick={(e) => openEditEvent(ev, e)} style={{ cursor: 'pointer', opacity: 0.7, lineHeight: 1 }}>✏️</span>
                        <span onClick={(e) => deleteEvent(ev.id, e)} style={{ cursor: 'pointer', opacity: 0.7, lineHeight: 1 }}>✕</span>
                      </span>
                    )}
                  </div>
                ))}
                {officePeople.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center' }}>
                    {officePeople.slice(0, 3).map(od => {
                      const name = getDisplayName(od.user_id)
                      const isMe = od.user_id === user?.id
                      return (
                        <div key={od.id} title={allProfiles[od.user_id]?.full_name || ''} style={{
                          borderRadius: '4px',
                          background: isMe ? 'var(--accent)' : 'var(--accent-muted)',
                          border: '1px solid var(--border-accent)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: '1px 4px',
                          fontSize: '9px', fontWeight: '700',
                          color: isMe ? '#1a1000' : 'var(--accent-light)',
                          whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{name}</div>
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

      {/* Add/Edit Event Modal — managers only */}
      {showAddEvent && isManager && (
        <div className="modal-overlay">
          <div className="modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '18px', fontWeight: '700' }}>
                {editingEvent ? 'Edit Event' : 'Add Company Event'}
              </h2>
              <button onClick={() => { setShowAddEvent(false); setEditingEvent(null) }} className="btn-secondary" style={{ padding: '0.4rem' }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={saveEvent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label>Event Title</label>
                <input className="input" placeholder="e.g. Team lunch, Company meeting" value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} required />
              </div>
              <div>
                <label>Date</label>
                <input className="input" type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)} required />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : editingEvent ? 'Save Changes' : 'Add Event'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => { setShowAddEvent(false); setEditingEvent(null) }}>Cancel</button>
                {editingEvent && (
                  <button type="button" className="btn-danger" onClick={(e) => { deleteEvent(editingEvent.id, e); setShowAddEvent(false) }}>
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
