'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import toast from 'react-hot-toast'
import { Clock, ExternalLink, ChevronDown, ChevronUp, Save } from 'lucide-react'

type Project = { id: string; name: string; code: string; description: string; status: string; sharepoint_url: string }
type HourLog = { id?: string; project_id: string; month: number; year: number; hours: number; notes: string }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function ProjectRow({ project, log, selectedMonth, selectedYear, onSave }: {
  project: Project; log: HourLog; selectedMonth: number; selectedYear: number;
  onSave: (projectId: string, hours: number, notes: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [localHours, setLocalHours] = useState(log.hours)
  const [localNotes, setLocalNotes] = useState(log.notes)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setLocalHours(log.hours); setLocalNotes(log.notes) }, [log.hours, log.notes])

  async function handleSave() {
    setSaving(true)
    await onSave(project.id, localHours, localNotes)
    setSaving(false)
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', cursor: 'pointer' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: '700', fontSize: '15px' }}>{project.name}</span>
            {project.code && (
              <span style={{ fontSize: '11px', background: 'var(--accent-muted)', color: 'var(--accent-light)', padding: '2px 8px', borderRadius: '20px', fontWeight: '600' }}>
                {project.code}
              </span>
            )}
            <span className={`badge ${project.status === 'active' ? 'badge-approved' : project.status === 'on_hold' ? 'badge-pending' : 'badge-rejected'}`} style={{ fontSize: '11px' }}>
              {project.status}
            </span>
          </div>
          {project.description && <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>{project.description}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {project.sharepoint_url && (
            <a href={project.sharepoint_url} target="_blank" rel="noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '12px', color: 'var(--accent-light)', textDecoration: 'none', background: 'var(--accent-muted)', padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--border-accent)' }}>
              <ExternalLink size={13} /> Excel Tracker
            </a>
          )}
          <div style={{ textAlign: 'right', minWidth: '60px' }}>
            <div style={{ fontWeight: '700', fontSize: '20px', color: log.hours > 0 ? 'var(--accent-light)' : 'var(--text-muted)' }}>{log.hours}h</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>this month</div>
          </div>
          {expanded ? <ChevronUp size={18} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={18} style={{ color: 'var(--text-muted)' }} />}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '1.25rem', background: 'var(--bg-secondary)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '1rem', alignItems: 'end' }}>
            <div>
              <label>Hours — {MONTHS[selectedMonth-1]} {selectedYear}</label>
              <input className="input" type="number" min="0" max="300" step="0.5"
                value={localHours} onChange={e => setLocalHours(+e.target.value)} />
            </div>
            <div>
              <label>Notes (optional)</label>
              <input className="input" placeholder="What did you work on?" value={localNotes} onChange={e => setLocalNotes(e.target.value)} />
            </div>
            <button className="btn-primary" disabled={saving} onClick={handleSave}>
              <Save size={15} /> {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProjectsPage() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [hourLogs, setHourLogs] = useState<Record<string, HourLog>>({})
  const [loading, setLoading] = useState(true)
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const YEARS = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  useEffect(() => { if (user) loadData() }, [user, selectedMonth, selectedYear])

  async function loadData() {
    setLoading(true)
    const { data: assignments } = await supabase
      .from('project_assignments').select('project_id, projects(*)').eq('user_id', user!.id)
    const projs: Project[] = (assignments || []).map((a: any) => a.projects).filter(Boolean)
    setProjects(projs)

    if (projs.length > 0) {
      const { data: logs } = await supabase.from('hour_logs').select('*')
        .eq('user_id', user!.id).eq('month', selectedMonth).eq('year', selectedYear)
        .in('project_id', projs.map(p => p.id))
      const logMap: Record<string, HourLog> = {}
      for (const log of (logs || [])) logMap[log.project_id] = log
      setHourLogs(logMap)
    }
    setLoading(false)
  }

  async function saveHours(projectId: string, hours: number, notes: string) {
    const existing = hourLogs[projectId]
    if (existing?.id) {
      const { error } = await supabase.from('hour_logs')
        .update({ hours, notes, updated_at: new Date().toISOString() }).eq('id', existing.id)
      if (error) { toast.error(error.message); return }
    } else {
      const { data, error } = await supabase.from('hour_logs').insert({
        project_id: projectId, user_id: user!.id,
        month: selectedMonth, year: selectedYear, hours, notes
      }).select().single()
      if (error) { toast.error(error.message); return }
      setHourLogs(prev => ({ ...prev, [projectId]: data }))
    }
    toast.success('Hours saved!')
    setHourLogs(prev => ({ ...prev, [projectId]: { ...(prev[projectId] || {}), hours, notes, project_id: projectId, month: selectedMonth, year: selectedYear } }))
  }

  const totalHours = Object.values(hourLogs).reduce((sum, l) => sum + (Number(l.hours) || 0), 0)

  return (
    <div className="fade-in">
      <div className="section-title">Projects & Hours · פרויקטים ושעות</div>
      <div className="section-subtitle">Report your monthly hours per project</div>

      {/* Month selector + total */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select className="input" style={{ width: 'auto' }} value={selectedMonth} onChange={e => setSelectedMonth(+e.target.value)}>
            {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
          </select>
          <select className="input" style={{ width: 'auto' }} value={selectedYear} onChange={e => setSelectedYear(+e.target.value)}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="card" style={{ padding: '0.6rem 1.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'var(--accent-muted)', border: '1px solid var(--border-accent)' }}>
          <Clock size={16} style={{ color: 'var(--accent-light)' }} />
          <span style={{ fontWeight: '700', color: 'var(--accent-light)', fontSize: '18px' }}>{totalHours}h</span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>total this month</span>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <Clock size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
          <div style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>No projects assigned yet</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '0.5rem' }}>Your manager will assign you to projects shortly</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {projects.map(project => (
            <ProjectRow
              key={project.id}
              project={project}
              log={hourLogs[project.id] || { hours: 0, notes: '', project_id: project.id, month: selectedMonth, year: selectedYear }}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              onSave={saveHours}
            />
          ))}
        </div>
      )}
    </div>
  )
}
