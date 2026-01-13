'use client';

import { Toaster } from '@/components/ui/toaster';
import { FirebaseProvider } from '@/components/firebase-provider';
import { ThemeProvider } from '@/components/theme-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <FirebaseProvider>
        {children}
      </FirebaseProvider>
      <Toaster />
    </ThemeProvider>
  );
}
