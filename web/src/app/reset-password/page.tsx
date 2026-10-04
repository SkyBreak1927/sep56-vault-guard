import type { Metadata } from 'next'
import { ResetPassword } from '@/sections/auth/ResetPassword'

export const metadata: Metadata = { title: 'Reset password — Aegis Vault' }

export default function Reset() {
  return <ResetPassword />
}
