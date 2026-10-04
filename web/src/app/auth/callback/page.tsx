import type { Metadata } from 'next'
import { AuthCallback } from '@/sections/auth/AuthCallback'

export const metadata: Metadata = { title: 'Signing in — Aegis Vault' }

export default function Callback() {
  return <AuthCallback />
}
