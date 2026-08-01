'use client';

import React, { createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import type { BankAccount, BankTransaction, Attachment, UserProfile, HistoryDeletionAudit } from '@/lib/types';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  getDoc,
  getDocs,
  query,
} from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';

type BankAccountFormValues = Omit<BankAccount, 'id' | 'currentBalance' | 'logoUrl' | 'lastHistoryDeletion'>;

interface BanksContextType {
  bankAccounts: BankAccount[];
  addBankAccount: (bankAccountData: BankAccountFormValues, logoFile: File | null) => Promise<void>;
  updateBankAccount: (id: string, bankAccountData: BankAccountFormValues, logoFile: File | null) => Promise<void>;
  deleteBankAccount: (id: string) => void;
  addBankTransaction: (bankAccountId: string, transactionData: Omit<BankTransaction, 'id' | 'source' | 'createdBy' | 'sortOrder'>) => void;
  updateBankTransaction: (bankAccountId: string, transactionId: string, updatedData: Partial<BankTransaction>) => Promise<void>;
  deleteBankTransaction: (bankAccountId: string, transaction: BankTransaction) => void;
  batchAddBankTransactions: (bankAccountId: string, transactionsWithFiles: { data: Omit<BankTransaction, 'id' | 'attachments' | 'source' | 'createdBy' | 'sortOrder'>, file: File }[]) => Promise<void>;
  batchAddConciliatedTransactions: (bankAccountId: string, transactions: Omit<BankTransaction, 'id' | 'source' | 'attachments' | 'createdBy' | 'sortOrder'>[]) => Promise<void>;
  reconcileBalance: (bankAccountId: string, targetDate: string, targetBalance: number) => Promise<void>;
  swapTransactions: (bankAccountId: string, t1: BankTransaction, t2: BankTransaction) => Promise<void>;
  clearTransactionHistory: (bankAccountId: string) => Promise<void>;
  loading: boolean;
}

const BanksContext = createContext<BanksContextType | undefined>(undefined);

export function BanksProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    async function fetchProfile() {
        if (user && firestore) {
            const snap = await getDoc(doc(firestore, 'users', user.uid));
            if (snap.exists()) setUserProfile(snap.data() as UserProfile);
        }
    }
    fetchProfile();
  }, [user, firestore]);

  const collectionPath = useMemo(() => {
    if (!user || !userProfile) return null;
    const isAuthorized = user.uid === 'fKZUAAXTENPcUeEA4tUXFEV4xbr1' || !!userProfile.canAccessBanks;
    return isAuthorized ? 'banks' : null;
  }, [user, userProfile]);

  const banksCollectionRef = useMemoFirebase(() => {
    return collectionPath ? collection(firestore, collectionPath) : null;
  }, [collectionPath, firestore]);

  const { data: bankAccounts, loading } = useCollection<BankAccount>(banksCollectionRef);
  
  const addBankAccount = async (bankAccountData: BankAccountFormValues, logoFile: File | null) => {
    if (!banksCollectionRef) return;
    let logoUrl = '';
    if (logoFile) {
        try {
            const storage = getStorage();
            const logoRef = storageRef(storage, `bank_logos/${Date.now()}_${logoFile.name}`);
            const snapshot = await uploadBytes(logoRef, logoFile);
            logoUrl = await getDownloadURL(snapshot.ref);
        } catch (error) {
            throw error;
        }
    }
    const dataToSave = {
        ...bankAccountData,
        logoUrl: logoUrl,
        currentBalance: Number(bankAccountData.initialBalance || 0)
    };
    try {
        await addDoc(banksCollectionRef, dataToSave);
    } catch(serverError) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: banksCollectionRef.path, operation: 'create', requestResourceData: dataToSave }));
        throw serverError;
    }
  };

  const updateBankAccount = async (id: string, bankAccountData: BankAccountFormValues, logoFile: File | null) => {
    if (!banksCollectionRef || !firestore) return;
    const docRef = doc(firestore, banksCollectionRef.path, id);
    try {
        const bankAccountSnap = await getDoc(docRef);
        if (!bankAccountSnap.exists()) throw new Error("La cuenta no existe");
        const oldData = bankAccountSnap.data() as BankAccount;
        
        // Recalculamos saldo actual basado en el cambio de saldo inicial
        const initialBalanceDiff = Number(bankAccountData.initialBalance || 0) - Number(oldData.initialBalance || 0);
        const newCurrentBalance = Number(oldData.currentBalance || 0) + initialBalanceDiff;
        
        const dataToUpdate: any = { 
            ...bankAccountData,
            currentBalance: newCurrentBalance
        };
        
        if (logoFile) {
            const storage = getStorage();
            const logoRef = storageRef(storage, `bank_logos/${Date.now()}_${logoFile.name}`);
            const snapshot = await uploadBytes(logoRef, logoFile);
            dataToUpdate.logoUrl = await getDownloadURL(snapshot.ref);
        }
        await updateDoc(docRef, dataToUpdate);
    } catch(serverError) {
        errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'update', requestResourceData: bankAccountData }));
        throw serverError;
    }
  };
  
  const deleteBankAccount = (id: string) => {
    if (!firestore || !collectionPath) return;
    const docRef = doc(firestore, collectionPath, id);
    deleteDoc(docRef).then(() => {
        toast({ title: 'Cuenta eliminada' });
    }).catch(async (serverError) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'delete' }));
    });
  };

  const addBankTransaction = async (bankAccountId: string, transactionData: Omit<BankTransaction, 'id' | 'source' | 'createdBy' | 'sortOrder'>) => {
    if (!firestore || !collectionPath) return;
    const bankAccountRef = doc(firestore, collectionPath, bankAccountId);
    const transactionsCollectionRef = collection(firestore, `${collectionPath}/${bankAccountId}/transactions`);
    
    try {
        const bankAccountSnap = await getDoc(bankAccountRef);
        if (!bankAccountSnap.exists()) throw new Error("La cuenta no existe.");
        const currentAccountData = bankAccountSnap.data() as BankAccount;
        
        const amount = Number(transactionData.amount);
        const newBalance = transactionData.type === 'ingreso' 
            ? Number(currentAccountData.currentBalance) + amount 
            : Number(currentAccountData.currentBalance) - amount;

        const batch = writeBatch(firestore);
        const newTransactionRef = doc(transactionsCollectionRef);
        
        batch.set(newTransactionRef, {
            ...transactionData,
            source: 'manual',
            createdBy: user?.displayName || user?.email || 'Desconocido',
            sortOrder: Date.now(),
        });
        
        batch.update(bankAccountRef, { currentBalance: newBalance });
        await batch.commit();
        toast({ title: 'Transacción agregada' });
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const updateBankTransaction = async (bankAccountId: string, transactionId: string, updatedData: Partial<BankTransaction>) => {
    if (!firestore || !collectionPath) return;
    const bankAccountRef = doc(firestore, collectionPath, bankAccountId);
    const transactionRef = doc(firestore, `${collectionPath}/${bankAccountId}/transactions`, transactionId);
    
    try {
        const [bankSnap, transSnap] = await Promise.all([
            getDoc(bankAccountRef),
            getDoc(transactionRef)
        ]);
        
        if (!bankSnap.exists() || !transSnap.exists()) throw new Error("Datos no encontrados.");
        
        const bankData = bankSnap.data() as BankAccount;
        const oldTransData = transSnap.data() as BankTransaction;
        
        const batch = writeBatch(firestore);
        
        // Revertimos impacto anterior
        let balanceAfterRevert = oldTransData.type === 'ingreso' 
            ? Number(bankData.currentBalance) - Number(oldTransData.amount)
            : Number(bankData.currentBalance) + Number(oldTransData.amount);
            
        // Aplicamos impacto nuevo
        const newAmount = updatedData.amount !== undefined ? Number(updatedData.amount) : Number(oldTransData.amount);
        const newType = updatedData.type || oldTransData.type;
        
        let finalBalance = newType === 'ingreso' 
            ? balanceAfterRevert + newAmount
            : balanceAfterRevert - newAmount;
            
        batch.update(transactionRef, updatedData);
        batch.update(bankAccountRef, { currentBalance: finalBalance });
        
        await batch.commit();
        toast({ title: 'Transacción actualizada' });
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const deleteBankTransaction = async (bankAccountId: string, transaction: BankTransaction) => {
     if (!firestore || !collectionPath) return;
    const bankAccountRef = doc(firestore, collectionPath, bankAccountId);
    const transactionRef = doc(firestore, `${collectionPath}/${bankAccountId}/transactions`, transaction.id);
    try {
        const bankAccountSnap = await getDoc(bankAccountRef);
        if (!bankAccountSnap.exists()) throw new Error("La cuenta no existe.");
        const currentAccountData = bankAccountSnap.data() as BankAccount;
        
        const newBalance = transaction.type === 'ingreso' 
            ? Number(currentAccountData.currentBalance) - Number(transaction.amount) 
            : Number(currentAccountData.currentBalance) + Number(transaction.amount);
            
        const batch = writeBatch(firestore);
        batch.delete(transactionRef);
        batch.update(bankAccountRef, { currentBalance: newBalance });
        await batch.commit();
        toast({ title: 'Transacción eliminada' });
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const batchAddBankTransactions = async (bankAccountId: string, transactionsWithFiles: { data: Omit<BankTransaction, 'id' | 'attachments' | 'source' | 'createdBy' | 'sortOrder'>, file: File }[]) => {
    if (!firestore || !collectionPath) return;
    const bankAccountRef = doc(firestore, collectionPath, bankAccountId);
    const storage = getStorage();
    try {
        const bankAccountSnap = await getDoc(bankAccountRef);
        if (!bankAccountSnap.exists()) throw new Error("La cuenta no existe.");
        const currentAccountData = bankAccountSnap.data() as BankAccount;
        
        let balanceChange = 0;
        transactionsWithFiles.forEach(({ data }) => { 
            balanceChange += data.type === 'ingreso' ? Number(data.amount) : -Number(data.amount); 
        });
        
        const newBalance = Number(currentAccountData.currentBalance) + balanceChange;
        const batch = writeBatch(firestore);
        const transactionsCollectionRef = collection(firestore, `${collectionPath}/${bankAccountId}/transactions`);
        
        let counter = 0;
        const uploadPromises = transactionsWithFiles.map(async ({ data, file }) => {
            const newTransactionRef = doc(transactionsCollectionRef);
            const attachmentRef = storageRef(storage, `bank_attachments/${bankAccountId}/${newTransactionRef.id}/${file.name}`);
            const snapshot = await uploadBytes(attachmentRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            
            const finalTransactionData = { 
                ...data, 
                source: 'import_file', 
                attachments: [{ name: file.name, type: file.type, size: file.size, url: downloadURL }], 
                createdBy: user?.displayName || user?.email || 'Desconocido',
                sortOrder: Date.now() + (counter++) 
            };
            batch.set(newTransactionRef, finalTransactionData);
        });
        
        await Promise.all(uploadPromises);
        batch.update(bankAccountRef, { currentBalance: newBalance });
        await batch.commit();
        toast({ title: "Importación Exitosa" });
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error de Importación', description: error.message });
    }
  };

  const batchAddConciliatedTransactions = async (bankAccountId: string, transactions: Omit<BankTransaction, 'id' | 'source' | 'attachments' | 'createdBy' | 'sortOrder'>[]) => {
    if (!firestore || !collectionPath) return;
    const bankAccountRef = doc(firestore, collectionPath, bankAccountId);
    try {
        const bankAccountSnap = await getDoc(bankAccountRef);
        if (!bankAccountSnap.exists()) throw new Error("La cuenta no existe.");
        const currentAccountData = bankAccountSnap.data() as BankAccount;
        
        let balanceChange = 0;
        transactions.forEach(tx => { 
            balanceChange += tx.type === 'ingreso' ? Number(tx.amount) : -Number(tx.amount); 
        });
        
        const newBalance = Number(currentAccountData.currentBalance) + balanceChange;
        const batch = writeBatch(firestore);
        const transactionsCollectionRef = collection(firestore, `${collectionPath}/${bankAccountId}/transactions`);
        
        let counter = 0;
        transactions.forEach(txData => {
            const newTransactionRef = doc(transactionsCollectionRef);
            batch.set(newTransactionRef, { 
                ...txData, 
                source: 'import_file', 
                createdBy: user?.displayName || user?.email || 'Desconocido',
                sortOrder: Date.now() + (counter++)
            });
        });
        
        batch.update(bankAccountRef, { currentBalance: newBalance });
        await batch.commit();
    } catch (error: any) {
        throw error;
    }
  };

  const reconcileBalance = async (bankAccountId: string, targetDate: string, targetBalance: number) => {
    if (!firestore || !collectionPath || !user) return;
    const bankAccountRef = doc(firestore, collectionPath, bankAccountId);
    try {
        const bankAccountSnap = await getDoc(bankAccountRef);
        if (!bankAccountSnap.exists()) throw new Error("La cuenta no existe.");
        const accountData = bankAccountSnap.data() as BankAccount;
        
        // Ajustamos el saldo actual directamente
        const difference = targetBalance - Number(accountData.currentBalance);
        
        if (Math.abs(difference) < 0.01) {
            toast({ title: 'El saldo ya coincide' });
            return;
        }

        const batch = writeBatch(firestore);
        const transactionsCollectionRef = collection(firestore, `${collectionPath}/${bankAccountId}/transactions`);
        
        batch.set(doc(transactionsCollectionRef), {
            date: new Date(targetDate + 'T12:00:00').toISOString(),
            description: `Ajuste por conciliación manual (${targetDate}) - Pendiente de identificar`,
            amount: Math.abs(difference),
            type: difference > 0 ? 'ingreso' : 'egreso',
            source: 'manual',
            isAdjustment: true,
            createdBy: user.displayName || user.email || 'Sistema',
            sortOrder: Date.now(),
        });
        
        batch.update(bankAccountRef, { currentBalance: targetBalance });
        await batch.commit();
        toast({ title: 'Saldo actualizado y ajuste registrado.' });
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error de Conciliación', description: error.message });
    }
  };

  const swapTransactions = async (bankAccountId: string, t1: BankTransaction, t2: BankTransaction) => {
    if (!firestore || !collectionPath) return;
    const t1Ref = doc(firestore, `${collectionPath}/${bankAccountId}/transactions`, t1.id);
    const t2Ref = doc(firestore, `${collectionPath}/${bankAccountId}/transactions`, t2.id);
    
    const batch = writeBatch(firestore);
    batch.update(t1Ref, { sortOrder: t2.sortOrder || Date.now() });
    batch.update(t2Ref, { sortOrder: t1.sortOrder || Date.now() });
    
    try {
        await batch.commit();
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error al reordenar', description: error.message });
    }
  };

  const clearTransactionHistory = async (bankAccountId: string) => {
    if (!firestore || !collectionPath || !user) return;
    const bankAccountRef = doc(firestore, collectionPath, bankAccountId);
    const transactionsRef = collection(firestore, `${collectionPath}/${bankAccountId}/transactions`);
    
    try {
      const bankAccountSnap = await getDoc(bankAccountRef);
      if (!bankAccountSnap.exists()) throw new Error("La cuenta no existe.");
      const accountData = bankAccountSnap.data() as BankAccount;

      // Restablecer el saldo actual al inicial
      const resetBalance = Number(accountData.initialBalance || 0);
      const audit: HistoryDeletionAudit = {
        deletedAt: new Date().toISOString(),
        deletedBy: user.displayName || user.email || 'Desconocido',
      };

      const batch = writeBatch(firestore);
      
      // Obtener todas las transacciones para borrar
      const transactionsSnap = await getDocs(transactionsRef);
      transactionsSnap.forEach((txDoc) => {
        batch.delete(txDoc.ref);
      });

      // Actualizar cuenta con auditoría y nuevo saldo
      batch.update(bankAccountRef, {
        currentBalance: resetBalance,
        lastHistoryDeletion: audit,
      });

      await batch.commit();
      toast({ title: 'Historial eliminado', description: 'Todas las transacciones han sido borradas y el saldo restablecido.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error al limpiar historial', description: error.message });
      throw error;
    }
  };

  const contextValue = {
    bankAccounts: bankAccounts || [],
    loading,
    addBankAccount,
    updateBankAccount,
    deleteBankAccount,
    addBankTransaction,
    updateBankTransaction,
    deleteBankTransaction,
    batchAddBankTransactions,
    batchAddConciliatedTransactions,
    reconcileBalance,
    swapTransactions,
    clearTransactionHistory,
  };

  return <BanksContext.Provider value={contextValue}>{children}</BanksContext.Provider>;
}

export function useBanks() {
  const context = useContext(BanksContext);
  if (context === undefined) throw new Error('useBanks must be used within a BanksProvider');
  return context;
}
