
import type { Metadata } from 'next';
import { Inter } from 'next/font/google'; 
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { Toaster } from '@/components/ui/toaster';
import Navbar from '@/components/layout/navbar';
import GlobalChatbotWidget from '@/components/layout/global-chatbot-widget';
import ScrollToTopButton from '@/components/layout/scroll-to-top-button'; // Added ScrollToTopButton

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
        {/* Removed GAPI/GIS scripts as Firebase direct OAuth is used */}
      </head>
      <body className={`${inter.variable} font-sans antialiased bg-background text-foreground`}>
        <AuthProvider>
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
          <ScrollToTopButton /> {/* Added ScrollToTopButton here */}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
