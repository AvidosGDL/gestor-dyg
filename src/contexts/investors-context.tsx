'use client';

import React, { createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import type { Investor, UserProfile, InvestmentUsage } from '@/lib/types';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';
import { addMonths, format, getDate } from 'date-fns';

interface InvestorsContextType {
  investors: Investor[];
  addInvestor: (investorData: Omit<Investor, 'id'>) => void;
  updateInvestor: (id: string, updatedData: Partial<Omit<Investor, 'id'>>) => void;
  deleteInvestor: (id: string) => void;
  loading: boolean;
}

const InvestorsContext = createContext<InvestorsContextType | undefined>(undefined);

const processInvestorData = (data: Partial<Omit<Investor, 'id'>>) => {
  const { investmentDate, investmentTerm, paymentType } = data;
  const processedData = { ...data };
  if (investmentDate && investmentTerm) {
    const startDate = new Date(investmentDate + 'T00:00:00');
    if (paymentType === 'mensual') {
      processedData.monthlyPaymentDay = getDate(startDate);
      processedData.liquidationDate = null;
    } else if (paymentType === 'pago_unico') {
      const endDate = addMonths(startDate, investmentTerm);
      processedData.liquidationDate = format(endDate, 'yyyy-MM-dd');
      processedData.monthlyPaymentDay = null;
    }
  }
  return processedData;
}

export function InvestorsProvider({ children }: { children: ReactNode }) {
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
    const isAuthorized = user.uid === 'fKZUAAXTENPcUeEA4tUXFEV4xbr1' || !!userProfile.canAccessInvestors;
    return isAuthorized ? 'investors' : null;
  }, [user, userProfile]);

  const investorsCollectionRef = useMemoFirebase(() => {
    return collectionPath ? collection(firestore, collectionPath) : null;
  }, [collectionPath, firestore]);

  const { data: investors, loading } = useCollection<Investor>(investorsCollectionRef);

  const addInvestor = (investorData: Omit<Investor, 'id'>) => {
    if (!investorsCollectionRef) return;
    const processedData = processInvestorData(investorData);
    addDoc(investorsCollectionRef, { ...processedData, fundUsage: [] }).catch(async (serverError) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: investorsCollectionRef.path, operation: 'create', requestResourceData: processedData }));
    });
  };

  const updateInvestor = (id: string, updatedData: Partial<Omit<Investor, 'id'>>) => {
    if (!firestore || !collectionPath) return;
    const docRef = doc(firestore, collectionPath, id);
    const processedData = processInvestorData(updatedData);
    updateDoc(docRef, processedData).catch(async (serverError) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'update', requestResourceData: processedData }));
    });
  };

  const deleteInvestor = (id: string) => {
    if (!firestore || !collectionPath) return;
    const docRef = doc(firestore, collectionPath, id);
    deleteDoc(docRef).catch(async (serverError) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'delete' }));
    });
  };

  const contextValue = { investors: investors || [], loading, addInvestor, updateInvestor, deleteInvestor };
  return <InvestorsContext.Provider value={contextValue}>{children}</InvestorsContext.Provider>;
}

export function useInvestors() {
  const context = useContext(InvestorsContext);
  if (context === undefined) throw new Error('useInvestors must be used within a InvestorsProvider');
  return context;
}
