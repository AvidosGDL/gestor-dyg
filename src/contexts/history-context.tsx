'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useMemo } from 'react';
import type { Task } from '@/lib/types';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import {
  collection,
  query,
  where,
  or,
} from 'firebase/firestore';

interface HistoryContextType {
  historyTasks: Task[];
  loading: boolean;
}

const HistoryContext = createContext<HistoryContextType | undefined>(undefined);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user } = useUser();

  const historyCollectionRef = useMemoFirebase(() => {
    return firestore ? collection(firestore, 'taskHistory') : null;
  }, [firestore]);

  const historyQuery = useMemoFirebase(() => {
    if (!user || !historyCollectionRef) return null;
    return query(historyCollectionRef, 
      or(
        where('ownerId', '==', user.uid),
        where('delegateToId', '==', user.uid)
      )
    );
  }, [user, historyCollectionRef]);

  const {
    data: historyTasks,
    loading,
  } = useCollection<Task>(historyQuery);

  const contextValue = useMemo(() => ({
    historyTasks: historyTasks || [],
    loading,
  }), [historyTasks, loading]);

  return (
    <HistoryContext.Provider value={contextValue}>{children}</HistoryContext.Provider>
  );
}

export function useHistory() {
  const context = useContext(HistoryContext);
  if (context === undefined) {
    throw new Error('useHistory must be used within a HistoryProvider');
  }
  return context;
}
