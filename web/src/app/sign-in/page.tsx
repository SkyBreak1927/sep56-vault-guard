import type { Metadata } from 'next'
import { AuthPage } from '@/sections/auth/AuthPage'

export const metadata: Metadata = { title: 'Sign in — Aegis Vault' }

export default function SignIn() {
  return <AuthPage mode="sign-in" />
}
