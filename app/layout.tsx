import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'HR Portal',
  description: 'Employee Self-Service Portal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="ltr">
      <body>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#2a3142',
              color: '#f0ede8',
              border: '1px solid rgba(201,146,74,0.3)',
              borderRadius: '12px',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: '14px',
            },
          }}
        />
      </body>
    </html>
  )
}
