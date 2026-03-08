import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider';
import { Inter } from 'next/font/google';
import { MessageCircleIcon } from 'lucide-react';
import { AISearch, AISearchPanel, AISearchTrigger } from '../components/search';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable}`} suppressHydrationWarning>
      <body>
        <RootProvider theme={{ defaultMode: 'dark' }}>
          <AISearch>
            <AISearchPanel />
            <AISearchTrigger
              position="float"
              className="w-auto flex items-center gap-2 rounded-2xl border bg-fd-secondary px-4 py-2 text-sm font-medium text-fd-secondary-foreground hover:bg-fd-accent"
            >
              <MessageCircleIcon className="size-4" />
              Ask AI
            </AISearchTrigger>
            {children}
          </AISearch>
        </RootProvider>
      </body>
    </html>
  );
}
