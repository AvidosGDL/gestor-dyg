

'use client';

import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import type { Investor } from '@/lib/types';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';

interface InvestorsContextType {
  investors: Investor[];
  addInvestor: (investorData: Omit<Investor, 'id'>) => void;
  updateInvestor: (id: string, updatedData: Partial<Omit<Investor, 'id'>>) => void;
  deleteInvestor: (id: string) => void;
  loading: boolean;
}

const InvestorsContext = createContext<InvestorsContextType | undefined>(undefined);

export function InvestorsProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const collectionPath = useMemo(() => {
    if (!user) return null;
    const isAuthorized = user.uid === 'fKZUAAXTENPcUeEA4tUXFEV4xbr1' || user.uid === 'cbXyvN4G98Q7Y9IaJHhec0MyjlT2';
    return isAuthorized ? 'investors' : null;
  }, [user]);


  const investorsCollectionRef = useMemoFirebase(() => {
    return collectionPath ? collection(firestore, collectionPath) : null;
  }, [collectionPath, firestore]);

  const { data: investors, loading } = useCollection<Investor>(investorsCollectionRef);

  const addInvestor = (investorData: Omit<Investor, 'id'>) => {
    if (!investorsCollectionRef) return;
    addDoc(investorsCollectionRef, investorData).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: investorsCollectionRef.path,
        operation: 'create',
        requestResourceData: investorData,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  };

  const updateInvestor = (id: string, updatedData: Partial<Omit<Investor, 'id'>>) => {
    if (!firestore || !collectionPath) return;
    const docRef = doc(firestore, collectionPath, id);
    updateDoc(docRef, updatedData).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: docRef.path,
        operation: 'update',
        requestResourceData: updatedData,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  };

  const deleteInvestor = (id: string) => {
    if (!firestore || !collectionPath) return;
    const docRef = doc(firestore, collectionPath, id);
    deleteDoc(docRef).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: docRef.path,
        operation: 'delete',
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  };

  const contextValue = {
    investors: investors || [],
    loading,
    addInvestor,
    updateInvestor,
    deleteInvestor,
  };

  return (
    <InvestorsContext.Provider value={contextValue}>{children}</InvestorsContext.Provider>
  );
}

export function useInvestors() {
  const context = useContext(InvestorsContext);
  if (context === undefined) {
    throw new Error('useInvestors must be used within a InvestorsProvider');
  }
  return context;
}
