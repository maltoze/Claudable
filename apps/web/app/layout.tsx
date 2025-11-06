import './globals.css'
import 'highlight.js/styles/github-dark.css'
import ThemeProvider from '@/components/ThemeProvider'
import GlobalSettingsProvider from '@/contexts/GlobalSettingsContext'
import { AuthProvider } from '@/contexts/AuthContext'
import InsufficientBalanceProvider from '@/contexts/InsufficientBalanceContext'
import InsufficientBalanceModal from '@/components/InsufficientBalanceModal'
import Header from '@/components/Header'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Claudecode desktop',
  description: 'Claudecode desktop Application',
  icons: {
    icon: '/Claudable_Icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen transition-colors duration-200">
        <ThemeProvider>
          <AuthProvider>
            <GlobalSettingsProvider>
              <InsufficientBalanceProvider>
                <Header />
                <main className="transition-colors duration-200">{children}</main>
                <InsufficientBalanceModal />
              </InsufficientBalanceProvider>
            </GlobalSettingsProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
