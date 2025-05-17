
import type { Metadata, Viewport } from 'next'; // Added Viewport
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { Toaster } from '@/components/ui/toaster';
import Navbar from '@/components/layout/navbar';
import GlobalChatbotWidget from '@/components/layout/global-chatbot-widget';
import ScrollToTopButton from '@/components/layout/scroll-to-top-button';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'SkillForge - Share Your Knowledge',
  description: 'AI-powered educational skill-sharing platform.',
  manifest: '/manifest.json', // PWA manifest
  icons: [ // PWA icons
    { rel: 'apple-touch-icon', url: '/icons/icon-192x192.png' },
    // Add other icon sizes if you have them
  ],
};

// PWA Viewport settings
export const viewport: Viewport = {
  themeColor: '#4DC0B5', // Matches accent color in globals.css
  initialScale: 1,
  width: 'device-width',
  // userScalable: false, // Optional: uncomment to prevent zooming
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Theme color for older browsers / PWA */}
        <meta name="theme-color" content="#4DC0B5" />
      </head>
      <body className={`${inter.variable} font-sans antialiased bg-background text-foreground`}>
        <AuthProvider>
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow">
              {children}
            </main>
          </div>
          <GlobalChatbotWidget />
          <ScrollToTopButton />
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
