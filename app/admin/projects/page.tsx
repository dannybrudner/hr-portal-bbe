'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import toast from 'react-hot-toast'
import Modal from '@/components/Modal'
import { Plus, X, Trash2, Users, Clock, ExternalLink, ChevronDown, ChevronUp, Upload, FileSpreadsheet } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Project = { id: string; name: string; code: string; description: string; status: string; sharepoint_url: string }
type Profile = { id: string; full_name: string; email: string }
type HourSummary = { user_id: string; total_hours: number; profile: Profile }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function AdminProjectsPage() {
  const { profile } = useAuth()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [employees, setEmployees] = useState<Profile[]>([])
  const [assignments, setAssignments] = useState<Record<string, string[]>>({}) // projectId -> [userId]
  const [hourSummaries, setHourSummaries] = useState<Record<string, HourSummary[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const YEARS = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  // New project form
  const [pName, setPName] = useState('')
  const [pCode, setPCode] = useState('')
  const [pDesc, setPDesc] = useState('')
  const [pStatus, setPStatus] = useState('active')
  const [pSharepoint, setPSharepoint] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile?.role !== 'manager') { router.push('/dashboard'); return }
    loadData()
  }, [profile, selectedMonth, selectedYear])

  async function loadData() {
    setLoading(true)
    const [{ data: projs }, { data: emps }] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email').eq('role', 'employee'),
    ])
    setProjects(projs || [])
    setEmployees(emps || [])

    // Load assignments
    const { data: assigns } = await supabase.from('project_assignments').select('project_id, user_id')
    const assignMap: Record<string, string[]> = {}
    for (const a of (assigns || [])) {
      if (!assignMap[a.project_id]) assignMap[a.project_id] = []
      assignMap[a.project_id].push(a.user_id)
    }
    setAssignments(assignMap)

    // Load hour summaries for selected month/year
    const { data: logs } = await supabase.from('hour_logs').select('project_id, user_id, hours, profiles(id, full_name, email)')
      .eq('month', selectedMonth).eq('year', selectedYear)
    const summaryMap: Record<string, HourSummary[]> = {}
    for (const log of (logs || [])) {
      if (!summaryMap[log.project_id]) summaryMap[log.project_id] = []
      summaryMap[log.project_id].push({ user_id: log.user_id, total_hours: log.hours, profile: (log as any).profiles })
    }
    setHourSummaries(summaryMap)
    setLoading(false)
  }

  async function uploadTracker(projectId: string, file: File) {
    if (!file) return
    const ext = file.name.split('.').pop()
    const path = `project-trackers/${projectId}.${ext}`
    const { error: uploadError } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
    if (uploadError) { toast.error('Upload failed: ' + uploadError.message); return }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
    const { error: updateError } = await supabase.from('projects').update({ sharepoint_url: urlData.publicUrl }).eq('id', projectId)
    if (updateError) toast.error(updateError.message)
    else { toast.success('Excel tracker uploaded!'); loadData() }
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('projects').insert({ name: pName, code: pCode, description: pDesc, status: pStatus, sharepoint_url: pSharepoint })
    if (error) toast.error(error.message)
    else { toast.success('Project created!'); setShowModal(false); setPName(''); setPCode(''); setPDesc(''); setPSharepoint(''); loadData() }
    setSaving(false)
  }

  async function deleteProject(id: string) {
    if (!confirm('Delete this project? All hour logs will be lost.')) return
    await supabase.from('projects').delete().eq('id', id)
    toast.success('Deleted')
    loadData()
  }

  async function toggleAssignment(projectId: string, userId: string) {
    const current = assignments[projectId] || []
    if (current.includes(userId)) {
      await supabase.from('project_assignments').delete().eq('project_id', projectId).eq('user_id', userId)
      setAssignments(prev => ({ ...prev, [projectId]: prev[projectId].filter(id => id !== userId) }))
      toast.success('Employee removed from project')
    } else {
      await supabase.from('project_assignments').insert({ project_id: projectId, user_id: userId })
      setAssignments(prev => ({ ...prev, [projectId]: [...(prev[projectId] || []), userId] }))
      toast.success('Employee assigned!')
    }
  }

  const totalHoursAllProjects = Object.values(hourSummaries).flat().reduce((sum, s) => sum + (Number(s.total_hours) || 0), 0)

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <div className="section-title">Project Management</div>
          <div className="section-subtitle">Manage projects, assign employees, track hours</div>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> New Project</button>
      </div>

      {/* Month selector + summary */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <select className="input" style={{ width: 'auto' }} value={selectedMonth} onChange={e => setSelectedMonth(+e.target.value)}>
          {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select className="input" style={{ width: 'auto' }} value={selectedYear} onChange={e => setSelectedYear(+e.target.value)}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="card" style={{ padding: '0.6rem 1.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'var(--accent-muted)', border: '1px solid var(--border-accent)' }}>
          <Clock size={16} style={{ color: 'var(--accent-light)' }} />
          <span style={{ fontWeight: '700', color: 'var(--accent-light)', fontSize: '18px' }}>{totalHoursAllProjects}h</span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>reported across all projects</span>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading...</div>
      ) : projects.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ color: 'var(--text-secondary)' }}>No projects yet — create your first one!</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {projects.map(project => {
            const assignedIds = assignments[project.id] || []
            const summaries = hourSummaries[project.id] || []
            const projectTotal = summaries.reduce((sum, s) => sum + (Number(s.total_hours) || 0), 0)
            const isOpen = expanded === project.id

            return (
              <div key={project.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Header */}
                <div onClick={() => setExpanded(isOpen ? null : project.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', cursor: 'pointer' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: '700', fontSize: '15px' }}>{project.name}</span>
                      {project.code && <span style={{ fontSize: '11px', background: 'var(--accent-muted)', color: 'var(--accent-light)', padding: '2px 8px', borderRadius: '20px', fontWeight: '600' }}>{project.code}</span>}
                      <span className={`badge ${project.status === 'active' ? 'badge-approved' : project.status === 'on_hold' ? 'badge-pending' : 'badge-rejected'}`} style={{ fontSize: '11px' }}>{project.status}</span>
                    </div>
                    {project.description && <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>{project.description}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {project.sharepoint_url && (
                      <a href={project.sharepoint_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '12px', color: 'var(--accent-light)', textDecoration: 'none', background: 'var(--accent-muted)', padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--border-accent)' }}>
                        <ExternalLink size={13} /> Excel
                      </a>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      <Users size={14} /> {assignedIds.length}
                    </div>
                    <div style={{ textAlign: 'right', minWidth: '55px' }}>
                      <div style={{ fontWeight: '700', fontSize: '18px', color: projectTotal > 0 ? 'var(--accent-light)' : 'var(--text-muted)' }}>{projectTotal}h</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>this month</div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); deleteProject(project.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
                      <Trash2 size={15} />
                    </button>
                    {isOpen ? <ChevronUp size={18} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={18} style={{ color: 'var(--text-muted)' }} />}
                  </div>
                </div>

                {/* Expanded: employees + hours */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                    {/* Assign employees */}
                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>ASSIGNED EMPLOYEES</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {employees.map(emp => {
                          const isAssigned = assignedIds.includes(emp.id)
                          return (
                            <button key={emp.id} onClick={() => toggleAssignment(project.id, emp.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.9rem', borderRadius: '20px', border: `1px solid ${isAssigned ? 'var(--accent)' : 'var(--border)'}`, background: isAssigned ? 'var(--accent-muted)' : 'transparent', color: isAssigned ? 'var(--accent-light)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: isAssigned ? '600' : '400', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                              {isAssigned && '✓ '}{emp.full_name || emp.email.split('@')[0]}
                            </button>
                          )
                        })}
                        {employees.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No employees found</span>}
                      </div>
                    </div>

                    {/* Hours this month */}
                    <div style={{ padding: '1rem 1.25rem' }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                        HOURS — {MONTHS[selectedMonth-1].toUpperCase()} {selectedYear}
                      </div>
                      {summaries.length === 0 ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No hours reported yet for this month</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {summaries.map(s => (
                            <div key={s.user_id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem 1rem', background: 'var(--bg-card)', borderRadius: '10px' }}>
                              <div style={{ flex: 1, fontSize: '14px', fontWeight: '500' }}>{s.profile?.full_name || s.profile?.email || 'Unknown'}</div>
                              <div style={{ fontWeight: '700', color: 'var(--accent-light)', fontSize: '16px' }}>{s.total_hours}h</div>
                            </div>
                          ))}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem', fontSize: '13px', color: 'var(--text-muted)' }}>
                            Total: <strong style={{ marginLeft: '0.5rem', color: 'var(--accent-light)' }}>{projectTotal}h</strong>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Project" maxWidth={560}>
            <form onSubmit={createProject} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                <div><label>Project Name *</label><input className="input" placeholder="e.g. Metro M3 Station" value={pName} onChange={e => setPName(e.target.value)} required /></div>
                <div><label>Code</label><input className="input" placeholder="e.g. M3-027" value={pCode} onChange={e => setPCode(e.target.value)} /></div>
              </div>
              <div><label>Description</label><input className="input" placeholder="Brief description..." value={pDesc} onChange={e => setPDesc(e.target.value)} /></div>
              <div>
                <label>Status</label>
                <select className="input" value={pStatus} onChange={e => setPStatus(e.target.value)}>
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label>SharePoint Excel Tracker URL</label>
                <input className="input" placeholder="https://bubreng.sharepoint.com/..." value={pSharepoint} onChange={e => setPSharepoint(e.target.value)} />
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Paste the direct link to the Excel file on SharePoint</div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Creating...' : 'Create Project'}</button>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
      </Modal>
    </div>
  )
}
