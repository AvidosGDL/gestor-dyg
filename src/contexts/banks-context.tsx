
'use client';

import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import type { BankAccount, BankTransaction } from '@/lib/types';
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

interface BanksContextType {
  bankAccounts: BankAccount[];
  addBankAccount: (bankAccountData: Omit<BankAccount, 'id' | 'currentBalance'>) => void;
  // updateBankAccount: (id: string, updatedData: Partial<Omit<BankAccount, 'id'>>) => void;
  // deleteBankAccount: (id: string) => void;
  loading: boolean;
}

const BanksContext = createContext<BanksContextType | undefined>(undefined);

export function BanksProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user } = useUser();

  const collectionPath = useMemo(() => {
    if (!user) return null;
    const authorizedUIDs = [
      'fKZUAAXTENPcUeEA4tUXFEV4xbr1', // daniel@avidos.mx
      'cbXyvN4G98Q7Y9IaJHhec0MyjlT2',   // roberto.d@gygproyectosfiscales.com
    ];
    return authorizedUIDs.includes(user.uid) ? 'banks' : null;
  }, [user]);


  const banksCollectionRef = useMemoFirebase(() => {
    return collectionPath ? collection(firestore, collectionPath) : null;
  }, [collectionPath, firestore]);

  const { data: bankAccounts, loading } = useCollection<BankAccount>(banksCollectionRef);
  
  // TODO: Logic to calculate currentBalance based on transactions will be added later.

  const addBankAccount = (bankAccountData: Omit<BankAccount, 'id' | 'currentBalance'>) => {
    if (!banksCollectionRef) return;
    
    const dataToSave = {
        ...bankAccountData,
        currentBalance: bankAccountData.initialBalance
    };

    addDoc(banksCollectionRef, dataToSave).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: banksCollectionRef.path,
        operation: 'create',
        requestResourceData: dataToSave,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  };
  
  const contextValue = {
    bankAccounts: bankAccounts || [],
    loading,
    addBankAccount,
  };

  return (
    <BanksContext.Provider value={contextValue}>{children}</BanksContext.Provider>
  );
}

export function useBanks() {
  const context = useContext(BanksContext);
  if (context === undefined) {
    throw new Error('useBanks must be used within a BanksProvider');
  }
  return context;
}
