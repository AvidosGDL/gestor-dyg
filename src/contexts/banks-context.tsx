
'use client';

import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import type { BankAccount, BankTransaction, Attachment } from '@/lib/types';
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
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';

interface BanksContextType {
  bankAccounts: BankAccount[];
  addBankAccount: (bankAccountData: Omit<BankAccount, 'id' | 'currentBalance'>) => void;
  addBankTransaction: (bankAccountId: string, transactionData: Omit<BankTransaction, 'id' | 'source'>) => void;
  deleteBankTransaction: (bankAccountId: string, transaction: BankTransaction) => void;
  batchAddBankTransactions: (bankAccountId: string, transactionsWithFiles: { data: Omit<BankTransaction, 'id' | 'attachments' | 'source'>, file: File }[]) => Promise<void>;
  batchAddConciliatedTransactions: (bankAccountId: string, transactions: Omit<BankTransaction, 'id' | 'source' | 'attachments'>[]) => Promise<void>;
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

  const batchAddBankTransactions = async (bankAccountId: string, transactionsWithFiles: { data: Omit<BankTransaction, 'id' | 'attachments' | 'source'>, file: File }[]) => {
    if (!firestore || !collectionPath) return;

    const bankAccountRef = doc(firestore, collectionPath, bankAccountId);
    const storage = getStorage();

    try {
        const bankAccountSnap = await getDoc(bankAccountRef);
        if (!bankAccountSnap.exists()) {
            throw new Error("La cuenta bancaria no existe.");
        }
        const currentAccountData = bankAccountSnap.data() as BankAccount;

        let balanceChange = 0;
        transactionsWithFiles.forEach(({ data }) => {
            balanceChange += data.type === 'ingreso' ? data.amount : -data.amount;
        });
        const newBalance = currentAccountData.currentBalance + balanceChange;

        const batch = writeBatch(firestore);
        const transactionsCollectionRef = collection(firestore, `${collectionPath}/${bankAccountId}/transactions`);

        const uploadPromises = transactionsWithFiles.map(async ({ data, file }) => {
            const newTransactionRef = doc(transactionsCollectionRef);
            
            const attachmentRef = storageRef(storage, `bank_attachments/${bankAccountId}/${newTransactionRef.id}/${file.name}`);
            const snapshot = await uploadBytes(attachmentRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);

            const newAttachment: Attachment = {
                name: file.name,
                type: file.type,
                size: file.size,
                url: downloadURL,
            };

            const finalTransactionData: Omit<BankTransaction, 'id'> = {
                ...data,
                source: 'import_file',
                attachments: [newAttachment]
            };
            
            batch.set(newTransactionRef, finalTransactionData);
        });

        await Promise.all(uploadPromises);
        
        batch.update(bankAccountRef, { currentBalance: newBalance });
        
        await batch.commit();
        
        toast({
            title: "Importación Exitosa",
            description: `${transactionsWithFiles.length} transacciones han sido agregadas.`
        });

    } catch (error: any) {
        console.error("Error en la importación batch:", error);
        toast({ variant: 'destructive', title: 'Error de Importación', description: error.message });
        const permissionError = new FirestorePermissionError({
            path: `banks/${bankAccountId}/transactions`,
            operation: 'create',
            requestResourceData: { info: "Batch import operation." },
        });
        errorEmitter.emit('permission-error', permissionError);
    }
  };

  const batchAddConciliatedTransactions = async (bankAccountId: string, transactions: Omit<BankTransaction, 'id' | 'source' | 'attachments'>[]) => {
    if (!firestore || !collectionPath) return;

    const bankAccountRef = doc(firestore, collectionPath, bankAccountId);
    
    try {
        const bankAccountSnap = await getDoc(bankAccountRef);
        if (!bankAccountSnap.exists()) {
            throw new Error("La cuenta bancaria no existe.");
        }
        const currentAccountData = bankAccountSnap.data() as BankAccount;

        let balanceChange = 0;
        transactions.forEach(tx => {
            balanceChange += tx.type === 'ingreso' ? tx.amount : -tx.amount;
        });
        const newBalance = currentAccountData.currentBalance + balanceChange;

        const batch = writeBatch(firestore);
        const transactionsCollectionRef = collection(firestore, `${collectionPath}/${bankAccountId}/transactions`);

        transactions.forEach(txData => {
            const newTransactionRef = doc(transactionsCollectionRef);
            const finalTransactionData: Omit<BankTransaction, 'id'> = {
                ...txData,
                source: 'conciliado_pdf',
            };
            batch.set(newTransactionRef, finalTransactionData);
        });
        
        batch.update(bankAccountRef, { currentBalance: newBalance });
        
        await batch.commit();

    } catch (error: any) {
        console.error("Error en la importación por conciliación:", error);
        const permissionError = new FirestorePermissionError({
            path: `banks/${bankAccountId}/transactions`,
            operation: 'create',
            requestResourceData: { info: "Conciliation import operation." },
        });
        errorEmitter.emit('permission-error', permissionError);
        throw error;
    }
  };


  const contextValue = {
    bankAccounts: bankAccounts || [],
    loading,
    addBankAccount,
    addBankTransaction,
    deleteBankTransaction,
    batchAddBankTransactions,
    batchAddConciliatedTransactions,
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
