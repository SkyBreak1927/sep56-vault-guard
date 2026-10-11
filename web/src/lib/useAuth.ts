'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { authConfigured, getSupabase } from './supabase'

export interface AuthState {
  user: User | null
  /** True until the stored session has been read. */
  loading: boolean
  /** The session came from a password reset link (PASSWORD_RECOVERY). */
  recovery: boolean
}

/** Current Supabase user, kept in sync across tabs and auth events. */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, loading: authConfigured, recovery: false })

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    // Subscribing in the same tick the client is created catches PASSWORD_RECOVERY
    // from the ?code= exchange; INITIAL_SESSION follows, so the flag is sticky.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState((prev) => ({
        user: session?.user ?? null,
        loading: false,
        recovery: prev.recovery || event === 'PASSWORD_RECOVERY',
      }))
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return state
}
