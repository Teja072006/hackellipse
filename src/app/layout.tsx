import type { Metadata } from 'next';
import { Inter } from 'next/font/google'; // Using Inter as a modern, clean font
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { Toaster } from '@/components/ui/toaster';
import Navbar from '@/components/layout/navbar';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'SkillSmith - Share Your Knowledge',
  description: 'AI-powered educational skill-sharing platform.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased bg-background text-foreground`}>
        <AuthProvider>
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow">
              {children}
            </main>
            {/* Add a footer if desired */}
            {/* <footer className="py-6 text-center text-muted-foreground">
              © {new Date().getFullYear()} SkillSmith
            </footer> */}
          </div>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
