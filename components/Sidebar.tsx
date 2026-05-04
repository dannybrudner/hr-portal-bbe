'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'
import {
  LayoutDashboard, CalendarDays, ReceiptText, FileText,
  FolderOpen, User, ShieldCheck, LogOut, Bell, Briefcase
} from 'lucide-react'

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, user, signOut } = useAuth()
  const [pendingLeave, setPendingLeave] = useState(0)
  const [unreadNotifs, setUnreadNotifs] = useState(0)
  const [showNotifs, setShowNotifs] = useState(false)
  const [notifs, setNotifs] = useState<any[]>([])

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : profile?.email?.slice(0, 2).toUpperCase() ?? 'HR'

  // Poll for pending leave count (managers) and unread notifications (employees)
  useEffect(() => {
    if (!user) return

    const fetchCounts = async () => {
      if (profile?.role === 'manager') {
        const { count } = await supabase.from('leave_requests')
          .select('*', { count: 'exact', head: true }).eq('status', 'pending')
        setPendingLeave(count || 0)
      }
      // All users get notifications
      const { count } = await supabase.from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('read', false)
      setUnreadNotifs(count || 0)
    }

    fetchCounts()
    const interval = setInterval(fetchCounts, 30000) // poll every 30s
    return () => clearInterval(interval)
  }, [user, profile?.role])

  async function openNotifications() {
    if (!user) return
    setShowNotifs(!showNotifs)
    if (!showNotifs) {
      const { data } = await supabase.from('notifications')
        .select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(10)
      setNotifs(data || [])
      // Mark all as read
      await supabase.from('notifications').update({ read: true }).eq('user_id', user.id)
      setUnreadNotifs(0)
    }
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: 0 },
    { href: '/leave', label: 'Leave Requests', icon: CalendarDays, badge: profile?.role !== 'manager' ? 0 : 0 },
    { href: '/refunds', label: 'Refund Requests', icon: ReceiptText, badge: 0 },
    { href: '/payslips', label: 'Payslips', icon: FileText, badge: 0 },
    { href: '/documents', label: 'Documents', icon: FolderOpen, badge: 0 },
    { href: '/projects', label: 'Projects & Hours', icon: Briefcase, badge: 0 },
  { href: '/profile', label: 'My Profile', icon: User, badge: 0 },
  ]

  return (
    <aside style={{
      width: '240px', flexShrink: 0,
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '1.25rem 1rem 1rem', borderBottom: '1px solid var(--border-accent)', background: '#1a1a1a' }}>
        <Image src="/logo.png" alt="Buchman Brudner Engineering" width={200} height={60}
          style={{ width: '100%', height: 'auto', objectFit: 'contain', cursor: 'pointer' }}
          onClick={() => router.push('/dashboard')} priority />
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, padding: '1rem' }}>
        {navItems.map(({ href, label, icon: Icon }) => {
          const isLeave = href === '/leave'
          return (
            <button
              key={href}
              className={`nav-link ${pathname === href ? 'active' : ''}`}
              onClick={() => router.push(href)}
              style={{ position: 'relative' }}
            >
              <Icon size={18} />
              {label}
              {/* Pending dot for Leave Requests — employees see their pending, managers see all pending */}
              {isLeave && pendingLeave > 0 && (
                <span style={{
                  marginLeft: 'auto', background: '#e06060', color: '#fff',
                  borderRadius: '10px', fontSize: '11px', fontWeight: '700',
                  padding: '1px 7px', minWidth: '20px', textAlign: 'center',
                }}>
                  {pendingLeave}
                </span>
              )}
            </button>
          )
        })}

        {profile?.role === 'manager' && (
          <>
          <button
            className={`nav-link ${pathname === '/admin' ? 'active' : ''}`}
            onClick={() => router.push('/admin')}
            style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem', position: 'relative' }}
          >
            <ShieldCheck size={18} />
            Manager Portal
            {pendingLeave > 0 && (
              <span style={{
                marginLeft: 'auto', background: '#C9A227', color: '#1a1000',
                borderRadius: '10px', fontSize: '11px', fontWeight: '700',
                padding: '1px 7px', minWidth: '20px', textAlign: 'center',
              }}>
                {pendingLeave}
              </span>
            )}
          </button>
          <button
            className={`nav-link ${pathname.startsWith('/admin/projects') ? 'active' : ''}`}
            onClick={() => router.push('/admin/projects')}
            style={{ paddingLeft: '2.5rem', fontSize: '13px' }}
          >
            <Briefcase size={15} />
            Project Management
          </button>
          </>
        )}
      </nav>

      {/* Notification bell + User footer */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '1rem' }}>
        {/* Bell button */}
        <button
          onClick={openNotifications}
          className="nav-link"
          style={{ position: 'relative', marginBottom: '0.75rem', justifyContent: 'space-between' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Bell size={18} />
            Notifications
          </div>
          {unreadNotifs > 0 && (
            <span style={{
              background: '#e06060', color: '#fff', borderRadius: '10px',
              fontSize: '11px', fontWeight: '700', padding: '1px 7px',
            }}>{unreadNotifs}</span>
          )}
        </button>

        {/* Notification dropdown */}
        {showNotifs && (
          <div style={{
            position: 'absolute', bottom: '130px', left: '240px', width: '300px',
            background: 'var(--bg-card)', border: '1px solid var(--border-accent)',
            borderRadius: '16px', padding: '1rem', zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '0.75rem', color: 'var(--accent-light)' }}>
              Notifications
            </div>
            {notifs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '1rem 0' }}>
                No notifications
              </div>
            ) : (
              notifs.map(n => (
                <div key={n.id} onClick={() => { setShowNotifs(false); if (n.link) router.push(n.link) }} style={{
                  padding: '0.6rem 0.75rem', borderRadius: '10px', marginBottom: '0.4rem',
                  background: n.read ? 'transparent' : 'var(--accent-muted)',
                  border: '1px solid var(--border)', cursor: 'pointer',
                }}>
                  <div style={{ fontWeight: '600', fontSize: '13px' }}>{n.title}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>{n.message}</div>
                </div>
              ))
            )}
          </div>
        )}

        {/* User info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div className="avatar" style={{ width: '36px', height: '36px', fontSize: '12px' }}>{initials}</div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {profile?.full_name || profile?.email?.split('@')[0] || 'Employee'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {profile?.email}
            </div>
          </div>
        </div>
        <button className="nav-link" onClick={signOut} style={{ color: 'var(--status-rejected)' }}>
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
