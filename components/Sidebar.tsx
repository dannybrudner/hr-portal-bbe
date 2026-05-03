'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import Image from 'next/image'
import {
  LayoutDashboard, CalendarDays, ReceiptText, FileText,
  FolderOpen, User, ShieldCheck, LogOut
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leave', label: 'Leave Requests', icon: CalendarDays },
  { href: '/refunds', label: 'Refund Requests', icon: ReceiptText },
  { href: '/payslips', label: 'Payslips', icon: FileText },
  { href: '/documents', label: 'Documents', icon: FolderOpen },
  { href: '/profile', label: 'My Profile', icon: User },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, signOut } = useAuth()

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : profile?.email?.slice(0, 2).toUpperCase() ?? 'HR'

  return (
    <aside style={{
      width: '240px', flexShrink: 0,
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0,
    }}>
      {/* Logo header */}
      <div style={{
        padding: '1.25rem 1rem 1rem',
        borderBottom: '1px solid var(--border-accent)',
        background: '#1a1a1a',
      }}>
        <Image
          src="/logo.png"
          alt="Buchman Brudner Engineering"
          width={200}
          height={60}
          style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
          priority
        />
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, padding: '1rem' }}>
        {navItems.map(({ href, label, icon: Icon }) => (
          <button
            key={href}
            className={`nav-link ${pathname === href ? 'active' : ''}`}
            onClick={() => router.push(href)}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}

        {profile?.role === 'manager' && (
          <button
            className={`nav-link ${pathname.startsWith('/admin') ? 'active' : ''}`}
            onClick={() => router.push('/admin')}
            style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}
          >
            <ShieldCheck size={18} />
            Manager Portal
          </button>
        )}
      </nav>

      {/* User footer */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '1rem' }}>
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
