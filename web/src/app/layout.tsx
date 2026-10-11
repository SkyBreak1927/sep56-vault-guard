import type { Metadata, Viewport } from 'next'
import { Geist, JetBrains_Mono } from 'next/font/google'
import './globals.css'

// Human prose, titles and controls (700 is reserved for the hero display line).
const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

// Machine values only: contract addresses, check output, timers.
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

const title = 'Aegis Vault — SEP-56 Conformance & Security Checker'
const description = 'Automated conformance and security checker for SEP-56 tokenized vaults on Stellar/Soroban.'

// Icons and share images come from the file conventions in this folder
// (icon.svg, apple-icon.png, opengraph-image.png, twitter-image.png).
export const metadata: Metadata = {
  // Origin only: Next adds basePath to the image URLs itself. Read at build time
  // so share previews get absolute URLs; on Vercel the production domain is the default.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : 'http://localhost:3000'),
  ),
  title,
  description,
  openGraph: { type: 'website', siteName: 'Aegis Vault', title, description },
  twitter: { card: 'summary_large_image', title, description },
}

export const viewport: Viewport = {
  themeColor: '#0c0d0e',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${geist.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
