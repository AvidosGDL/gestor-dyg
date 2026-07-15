'use client';

import React, { createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import type { BankAccount, BankTransaction, Attachment, UserProfile } from '@/lib/types';
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

type BankAccountFormValues = Omit<BankAccount, 'id' | 'currentBalance' | 'logoUrl'>;

interface BanksContextType {
  bankAccounts: BankAccount[];
  addBankAccount: (bankAccountData: BankAccountFormValues, logoFile: File | null) => Promise<void>;
  updateBankAccount: (id: string, bankAccountData: BankAccountFormValues, logoFile: File | null) => Promise<void>;
  deleteBankAccount: (id: string) => void;
  addBankTransaction: (bankAccountId: string, transactionData: Omit<BankTransaction, 'id' | 'source' | 'createdBy'>) => void;
  updateBankTransaction: (bankAccountId: string, transactionId: string, updatedData: Partial<BankTransaction>) => Promise<void>;
  deleteBankTransaction: (bankAccountId: string, transaction: BankTransaction) => void;
  batchAddBankTransactions: (bankAccountId: string, transactionsWithFiles: { data: Omit<BankTransaction, 'id' | 'attachments' | 'source' | 'createdBy'>, file: File }[]) => Promise<void>;
  batchAddConciliatedTransactions: (bankAccountId: string, transactions: Omit<BankTransaction, 'id' | 'source' | 'attachments' | 'createdBy'>[]) => Promise<void>;
  reconcileBalance: (bankAccountId: string, targetDate: string, targetBalance: number) => Promise<void>;
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
        const dataToUpdate: Partial<BankAccount> = { ...bankAccountData };
        const initialBalanceDiff = Number(bankAccountData.initialBalance || 0) - Number(oldData.initialBalance || 0);
        dataToUpdate.currentBalance = Number(oldData.currentBalance || 0) + initialBalanceDiff;
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

  const addBankTransaction = async (bankAccountId: string, transactionData: Omit<BankTransaction, 'id' | 'source' | 'createdBy'>) => {
    if (!firestore || !collectionPath) return;
    const bankAccountRef = doc(firestore, collectionPath, bankAccountId);
    const transactionsCollectionRef = collection(firestore, `${collectionPath}/${bankAccountId}/transactions`);
    const dataToSave: Omit<BankTransaction, 'id'> = {
        ...transactionData,
        source: 'manual',
        createdBy: user?.displayName || user?.email || 'Desconocido',
    };
    try {
        const bankAccountSnap = await getDoc(bankAccountRef);
        if (!bankAccountSnap.exists()) throw new Error("La cuenta no existe.");
        const currentAccountData = bankAccountSnap.data() as BankAccount;
        const newBalance = transactionData.type === 'ingreso' ? Number(currentAccountData.currentBalance) + Number(transactionData.amount) : Number(currentAccountData.currentBalance) - Number(transactionData.amount);
        const batch = writeBatch(firestore);
        const newTransactionRef = doc(transactionsCollectionRef);
        batch.set(newTransactionRef, dataToSave);
        batch.update(bankAccountRef, { currentBalance: newBalance });
        await batch.commit();
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
        
        // Revert old transaction impact on balance
        let balanceAfterRevert = oldTransData.type === 'ingreso' 
            ? Number(bankData.currentBalance) - Number(oldTransData.amount)
            : Number(bankData.currentBalance) + Number(oldTransData.amount);
            
        // Apply new transaction impact
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
        const newBalance = transaction.type === 'ingreso' ? Number(currentAccountData.currentBalance) - Number(transaction.amount) : Number(currentAccountData.currentBalance) + Number(transaction.amount);
        const batch = writeBatch(firestore);
        batch.delete(transactionRef);
        batch.update(bankAccountRef, { currentBalance: newBalance });
        await batch.commit();
        toast({ title: 'Transacción eliminada' });
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const batchAddBankTransactions = async (bankAccountId: string, transactionsWithFiles: { data: Omit<BankTransaction, 'id' | 'attachments' | 'source' | 'createdBy'>, file: File }[]) => {
    if (!firestore || !collectionPath) return;
    const bankAccountRef = doc(firestore, collectionPath, bankAccountId);
    const storage = getStorage();
    try {
        const bankAccountSnap = await getDoc(bankAccountRef);
        if (!bankAccountSnap.exists()) throw new Error("La cuenta no existe.");
        const currentAccountData = bankAccountSnap.data() as BankAccount;
        let balanceChange = 0;
        transactionsWithFiles.forEach(({ data }) => { balanceChange += data.type === 'ingreso' ? Number(data.amount) : -Number(data.amount); });
        const newBalance = Number(currentAccountData.currentBalance) + balanceChange;
        const batch = writeBatch(firestore);
        const transactionsCollectionRef = collection(firestore, `${collectionPath}/${bankAccountId}/transactions`);
        const uploadPromises = transactionsWithFiles.map(async ({ data, file }) => {
            const newTransactionRef = doc(transactionsCollectionRef);
            const attachmentRef = storageRef(storage, `bank_attachments/${bankAccountId}/${newTransactionRef.id}/${file.name}`);
            const snapshot = await uploadBytes(attachmentRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            const newAttachment: Attachment = { name: file.name, type: file.type, size: file.size, url: downloadURL };
            const finalTransactionData: Omit<BankTransaction, 'id'> = { ...data, source: 'import_file', attachments: [newAttachment], createdBy: user?.displayName || user?.email || 'Desconocido' };
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

  const batchAddConciliatedTransactions = async (bankAccountId: string, transactions: Omit<BankTransaction, 'id' | 'source' | 'attachments' | 'createdBy'>[]) => {
    if (!firestore || !collectionPath) return;
    const bankAccountRef = doc(firestore, collectionPath, bankAccountId);
    try {
        const bankAccountSnap = await getDoc(bankAccountRef);
        if (!bankAccountSnap.exists()) throw new Error("La cuenta no existe.");
        const currentAccountData = bankAccountSnap.data() as BankAccount;
        let balanceChange = 0;
        transactions.forEach(tx => { balanceChange += tx.type === 'ingreso' ? Number(tx.amount) : -Number(tx.amount); });
        const newBalance = Number(currentAccountData.currentBalance) + balanceChange;
        const batch = writeBatch(firestore);
        const transactionsCollectionRef = collection(firestore, `${collectionPath}/${bankAccountId}/transactions`);
        transactions.forEach(txData => {
            const newTransactionRef = doc(transactionsCollectionRef);
            batch.set(newTransactionRef, { ...txData, source: 'conciliado_pdf', createdBy: user?.displayName || user?.email || 'Desconocido' });
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
    const transactionsCollectionRef = collection(firestore, `${collectionPath}/${bankAccountId}/transactions`);
    try {
        const bankAccountSnap = await getDoc(bankAccountRef);
        if (!bankAccountSnap.exists()) throw new Error("La cuenta no existe.");
        const accountData = bankAccountSnap.data() as BankAccount;
        const txSnap = await getDocs(query(transactionsCollectionRef));
        let calculatedBalanceAtDate = Number(accountData.initialBalance || 0);
        const targetDateObj = new Date(targetDate + 'T23:59:59');
        if (new Date(accountData.balanceDate) > targetDateObj) {
            toast({ variant: 'destructive', title: 'Error de Fecha', description: 'No puede ser anterior a la fecha inicial.' });
            return;
        }
        txSnap.forEach(txDoc => {
            const tx = txDoc.data() as BankTransaction;
            if (new Date(tx.date) <= targetDateObj) calculatedBalanceAtDate += (tx.type === 'ingreso' ? Number(tx.amount) : -Number(tx.amount));
        });
        const difference = targetBalance - calculatedBalanceAtDate;
        if (Math.abs(difference) < 0.01) {
            toast({ title: 'Saldo Correcto' });
            return;
        }
        const batch = writeBatch(firestore);
        batch.set(doc(transactionsCollectionRef), {
            date: new Date(targetDate + 'T12:00:00').toISOString(),
            description: `Ajuste por conciliación manual (${targetDate})`,
            amount: Math.abs(difference),
            type: difference > 0 ? 'ingreso' : 'egreso',
            source: 'manual',
            createdBy: user.displayName || user.email || 'Sistema',
        });
        batch.update(bankAccountRef, { currentBalance: Number(accountData.currentBalance) + difference });
        await batch.commit();
        toast({ title: 'Ajuste Realizado' });
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error de Conciliación', description: error.message });
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
  };

  return <BanksContext.Provider value={contextValue}>{children}</BanksContext.Provider>;
}

export function useBanks() {
  const context = useContext(BanksContext);
  if (context === undefined) throw new Error('useBanks must be used within a BanksProvider');
  return context;
}
