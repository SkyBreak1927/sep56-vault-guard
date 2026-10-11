import type { Metadata } from 'next'
import { AuthPage } from '@/sections/auth/AuthPage'

export const metadata: Metadata = { title: 'Create account — Aegis Vault' }

export default function SignUp() {
  return <AuthPage mode="sign-up" />
}
