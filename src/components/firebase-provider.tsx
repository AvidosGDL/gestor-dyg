'use client';

import {
  initializeFirebase,
  FirebaseProvider as GenkitFirebaseProvider,
} from '@/firebase';
import { FirebaseErrorListener } from '@/components/firebase-error-listener';
import { useMemo } from 'react';

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const firebaseServices = useMemo(() => {
    return initializeFirebase();
  }, []);

  return (
    <GenkitFirebaseProvider
      firebaseApp={firebaseServices.firebaseApp}
      auth={firebaseServices.auth}
      firestore={firebaseServices.firestore}
    >
      {children}
      <FirebaseErrorListener />
    </GenkitFirebaseProvider>
  );
}
