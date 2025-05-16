
import type { Metadata } from 'next';
import { Inter } from 'next/font/google'; 
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { Toaster } from '@/components/ui/toaster';
import Navbar from '@/components/layout/navbar';
import GlobalChatbotWidget from '@/components/layout/global-chatbot-widget';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'SkillForge - Share Your Knowledge',
  description: 'AI-powered educational skill-sharing platform.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* GAPI script for Google Sign-In (legacy, as per previous setup) */}
        <script src="https://apis.google.com/js/platform.js" async defer></script>
      </head>
      <body className={`${inter.variable} font-sans antialiased bg-background text-foreground`}>
        <AuthProvider> {/* Firebase AuthProvider */}
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow">
              {children}
            </main>
            {/* <footer className="py-6 text-center text-muted-foreground">
              © {new Date().getFullYear()} SkillForge
            </footer> */}
          </div>
          <GlobalChatbotWidget />
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
