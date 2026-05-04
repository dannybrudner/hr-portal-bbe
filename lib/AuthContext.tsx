'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, Profile } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'

type AuthContextType = {
  user: User | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null, profile: null, loading: true,
  signOut: async () => {}, refreshProfile: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) setProfile(data)
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Reject unconfirmed users — must verify email first
      const confirmedUser = session?.user?.email_confirmed_at ? session.user : null
      setUser(confirmedUser ?? null)
      if (confirmedUser) fetchProfile(confirmedUser.id)
      else if (session?.user && !session.user.email_confirmed_at) {
        // Sign them out cleanly so they get redirected to login
        supabase.auth.signOut()
      }
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const confirmedUser = session?.user?.email_confirmed_at ? session.user : null
      setUser(confirmedUser ?? null)
      if (confirmedUser) fetchProfile(confirmedUser.id)
      else setProfile(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
