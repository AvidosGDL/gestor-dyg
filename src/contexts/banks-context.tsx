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

  const collectionPath = useMemo(() => {
    if (!user) return null;
    const authorizedUIDs = [
      'fKZUAAXTENPcUeEA4tUXFEV4xbr1', // daniel@avidos.mx
      'cbXyvN4G98Q7Y9IaJHhec0MyjlT2',   // roberto.d@gygproyectosfiscales.com
      'cAmV6Hn6zNhbu45WXo9LFRRd2k82',   // tesoreria1@dygproyectosfiscales.com
      '0QjliF8VEbgA7ZAfAvJvrv22pII3',   // direccion@dygproyectosfiscales.com
    ];
    return authorizedUIDs.includes(user.uid) ? 'banks' : null;
  }, [user]);


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
            console.error("Error al subir logo:", error);
            toast({
                variant: 'destructive',
                title: 'Error de Carga',
                description: 'No se pudo subir el logo del banco.'
            });
            throw error;
        }
    }

    const dataToSave = {
        ...bankAccountData,
        companyName: bankAccountData.companyName,
        clabe: bankAccountData.clabe || '',
        logoUrl: logoUrl,
        currentBalance: Number(bankAccountData.initialBalance || 0)
    };

    try {
        await addDoc(banksCollectionRef, dataToSave);
    } catch(serverError) {
        const permissionError = new FirestorePermissionError({
            path: banksCollectionRef.path,
            operation: 'create',
            requestResourceData: dataToSave,
        });
        errorEmitter.emit('permission-error', permissionError);
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

        // Ajustar el saldo actual si el saldo inicial cambió
        const initialBalanceDiff = Number(bankAccountData.initialBalance || 0) - Number(oldData.initialBalance || 0);
        dataToUpdate.currentBalance = Number(oldData.currentBalance || 0) + initialBalanceDiff;

        if (logoFile) {
            try {
                const storage = getStorage();
                const logoRef = storageRef(storage, `bank_logos/${Date.now()}_${logoFile.name}`);
                const snapshot = await uploadBytes(logoRef, logoFile);
                dataToUpdate.logoUrl = await getDownloadURL(snapshot.ref);
            } catch (error) {
                console.error("Error al subir nuevo logo:", error);
                toast({
                    variant: 'destructive',
                    title: 'Error de Carga',
                    description: 'No se pudo subir el nuevo logo del banco.'
                });
                throw error;
            }
        }

        await updateDoc(docRef, dataToUpdate);
    } catch(serverError) {
        const permissionError = new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: bankAccountData,
        });
        errorEmitter.emit('permission-error', permissionError);
        throw serverError;
    }
  };
  
  const deleteBankAccount = (id: string) => {
    if (!firestore || !collectionPath) return;
    const docRef = doc(firestore, collectionPath, id);
    deleteDoc(docRef).then(() => {
        toast({ title: 'Cuenta eliminada', description: `La cuenta ha sido eliminada.` });
    }).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: docRef.path,
        operation: 'delete',
      });
      errorEmitter.emit('permission-error', permissionError);
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
        if (!bankAccountSnap.exists()) {
            throw new Error("La cuenta bancaria no existe.");
        }
        const currentAccountData = bankAccountSnap.data() as BankAccount;
        
        const newBalance = transactionData.type === 'ingreso'
            ? Number(currentAccountData.currentBalance) + Number(transactionData.amount)
            : Number(currentAccountData.currentBalance) - Number(transactionData.amount);

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
        
        const newBalance = transaction.type === 'ingreso'
            ? Number(currentAccountData.currentBalance) - Number(transaction.amount)
            : Number(currentAccountData.currentBalance) + Number(transaction.amount);

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

  const batchAddBankTransactions = async (bankAccountId: string, transactionsWithFiles: { data: Omit<BankTransaction, 'id' | 'attachments' | 'source' | 'createdBy'>, file: File }[]) => {
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
            balanceChange += data.type === 'ingreso' ? Number(data.amount) : -Number(data.amount);
        });
        const newBalance = Number(currentAccountData.currentBalance) + balanceChange;

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
                attachments: [newAttachment],
                createdBy: user?.displayName || user?.email || 'Desconocido',
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
    }
  };

  const batchAddConciliatedTransactions = async (bankAccountId: string, transactions: Omit<BankTransaction, 'id' | 'source' | 'attachments' | 'createdBy'>[]) => {
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
            balanceChange += tx.type === 'ingreso' ? Number(tx.amount) : -Number(tx.amount);
        });
        const newBalance = Number(currentAccountData.currentBalance) + balanceChange;

        const batch = writeBatch(firestore);
        const transactionsCollectionRef = collection(firestore, `${collectionPath}/${bankAccountId}/transactions`);

        transactions.forEach(txData => {
            const newTransactionRef = doc(transactionsCollectionRef);
            const finalTransactionData: Omit<BankTransaction, 'id'> = {
                ...txData,
                source: 'conciliado_pdf',
                createdBy: user?.displayName || user?.email || 'Desconocido',
            };
            batch.set(newTransactionRef, finalTransactionData);
        });
        
        batch.update(bankAccountRef, { currentBalance: newBalance });
        
        await batch.commit();

    } catch (error: any) {
        console.error("Error en la importación por conciliación:", error);
        throw error;
    }
  };

  const reconcileBalance = async (bankAccountId: string, targetDate: string, targetBalance: number) => {
    if (!firestore || !collectionPath || !user) return;

    const bankAccountRef = doc(firestore, collectionPath, bankAccountId);
    const transactionsCollectionRef = collection(firestore, `${collectionPath}/${bankAccountId}/transactions`);

    try {
        const bankAccountSnap = await getDoc(bankAccountRef);
        if (!bankAccountSnap.exists()) throw new Error("La cuenta bancaria no existe.");
        const accountData = bankAccountSnap.data() as BankAccount;

        // Obtenemos todas las transacciones para calcular el saldo a la fecha objetivo
        const q = query(transactionsCollectionRef);
        const txSnap = await getDocs(q);
        
        let calculatedBalanceAtDate = Number(accountData.initialBalance || 0);
        const targetDateObj = new Date(targetDate + 'T23:59:59'); // Final del día

        // Solo sumamos si la fecha inicial es anterior o igual
        if (new Date(accountData.balanceDate) > targetDateObj) {
            toast({ 
                variant: 'destructive', 
                title: 'Error de Fecha', 
                description: 'La fecha de conciliación no puede ser anterior a la fecha del saldo inicial.' 
            });
            return;
        }

        txSnap.forEach(txDoc => {
            const tx = txDoc.data() as BankTransaction;
            if (new Date(tx.date) <= targetDateObj) {
                calculatedBalanceAtDate += (tx.type === 'ingreso' ? Number(tx.amount) : -Number(tx.amount));
            }
        });

        const difference = targetBalance - calculatedBalanceAtDate;

        if (Math.abs(difference) < 0.01) {
            toast({ title: 'Saldo Correcto', description: 'El saldo del sistema ya coincide con el saldo ingresado para esa fecha.' });
            return;
        }

        const batch = writeBatch(firestore);
        const newTransactionRef = doc(transactionsCollectionRef);
        
        const adjustmentData: Omit<BankTransaction, 'id'> = {
            date: new Date(targetDate + 'T12:00:00').toISOString(),
            description: `Ajuste por conciliación de saldo (Diferencia detectada el ${targetDate})`,
            amount: Math.abs(difference),
            type: difference > 0 ? 'ingreso' : 'egreso',
            source: 'manual',
            createdBy: user.displayName || user.email || 'Sistema (Conciliación)',
        };

        batch.set(newTransactionRef, adjustmentData);

        // Actualizamos también el saldo total actual de la cuenta
        const newOverallBalance = Number(accountData.currentBalance) + difference;
        batch.update(bankAccountRef, { currentBalance: newOverallBalance });

        await batch.commit();

        toast({ 
            title: 'Ajuste Realizado', 
            description: `Se ha generado un ${difference > 0 ? 'ingreso' : 'egreso'} de $${Math.abs(difference).toLocaleString('en-US', { minimumFractionDigits: 2 })} para cuadrar el saldo.` 
        });

    } catch (error: any) {
        console.error("Error en la conciliación:", error);
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
    deleteBankTransaction,
    batchAddBankTransactions,
    batchAddConciliatedTransactions,
    reconcileBalance,
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
