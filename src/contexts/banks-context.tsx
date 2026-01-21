
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
  writeBatch,
  getDoc,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';

interface BanksContextType {
  bankAccounts: BankAccount[];
  addBankAccount: (bankAccountData: Omit<BankAccount, 'id' | 'currentBalance'>) => void;
  addBankTransaction: (bankAccountId: string, transactionData: Omit<BankTransaction, 'id' | 'source'>) => void;
  deleteBankTransaction: (bankAccountId: string, transaction: BankTransaction) => void;
  loading: boolean;
}

const BanksContext = createContext<BanksContextType | undefined>(undefined);

export function BanksProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

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

  const addBankTransaction = async (bankAccountId: string, transactionData: Omit<BankTransaction, 'id' | 'source'>) => {
    if (!firestore || !collectionPath) return;

    const bankAccountRef = doc(firestore, collectionPath, bankAccountId);
    const transactionsCollectionRef = collection(firestore, `${collectionPath}/${bankAccountId}/transactions`);

    const dataToSave: Omit<BankTransaction, 'id'> = {
        ...transactionData,
        source: 'manual',
    };

    try {
        const bankAccountSnap = await getDoc(bankAccountRef);
        if (!bankAccountSnap.exists()) {
            throw new Error("La cuenta bancaria no existe.");
        }
        const currentAccountData = bankAccountSnap.data() as BankAccount;
        
        const newBalance = transactionData.type === 'ingreso'
            ? currentAccountData.currentBalance + transactionData.amount
            : currentAccountData.currentBalance - transactionData.amount;

        const batch = writeBatch(firestore);
        
        const newTransactionRef = doc(transactionsCollectionRef);
        batch.set(newTransactionRef, dataToSave);
        batch.update(bankAccountRef, { currentBalance: newBalance });

        await batch.commit();

    } catch (error: any) {
        console.error("Error agregando transacción:", error);
        toast({ variant: 'destructive', title: 'Error', description: error.message });
         const permissionError = new FirestorePermissionError({
            path: transactionsCollectionRef.path,
            operation: 'create',
            requestResourceData: dataToSave,
        });
        errorEmitter.emit('permission-error', permissionError);
    }
  };

  const deleteBankTransaction = async (bankAccountId: string, transaction: BankTransaction) => {
     if (!firestore || !collectionPath) return;

    const bankAccountRef = doc(firestore, collectionPath, bankAccountId);
    const transactionRef = doc(firestore, `${collectionPath}/${bankAccountId}/transactions`, transaction.id);

    try {
        const bankAccountSnap = await getDoc(bankAccountRef);
        if (!bankAccountSnap.exists()) {
            throw new Error("La cuenta bancaria no existe.");
        }
        const currentAccountData = bankAccountSnap.data() as BankAccount;
        
        // Reverse the transaction to calculate the previous balance
        const newBalance = transaction.type === 'ingreso'
            ? currentAccountData.currentBalance - transaction.amount
            : currentAccountData.currentBalance + transaction.amount;

        const batch = writeBatch(firestore);
        
        batch.delete(transactionRef);
        batch.update(bankAccountRef, { currentBalance: newBalance });

        await batch.commit();
        
        toast({ title: 'Transacción eliminada', description: 'Se ha revertido el movimiento y actualizado el saldo.' });

    } catch (error: any) {
        console.error("Error eliminando transacción:", error);
        toast({ variant: 'destructive', title: 'Error', description: error.message });
         const permissionError = new FirestorePermissionError({
            path: transactionRef.path,
            operation: 'delete',
        });
        errorEmitter.emit('permission-error', permissionError);
    }
  };

  const contextValue = {
    bankAccounts: bankAccounts || [],
    loading,
    addBankAccount,
    addBankTransaction,
    deleteBankTransaction,
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
