'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import type { Prospect } from '@/lib/types';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useTasks } from './tasks-context';

interface ProspectsContextType {
  prospects: Prospect[];
  addProspect: (prospectData: Omit<Prospect, 'id'>) => void;
  updateProspect: (id: string, updatedData: Partial<Omit<Prospect, 'id'>>) => void;
  deleteProspect: (id: string) => void;
  loading: boolean;
}

const ProspectsContext = createContext<ProspectsContextType | undefined>(undefined);

export function ProspectsProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { addTask } = useTasks();

  const collectionPath = user ? `users/${user.uid}/prospects` : null;

  const prospectsCollectionRef = useMemoFirebase(() => {
    return collectionPath ? collection(firestore, collectionPath) : null;
  }, [collectionPath, firestore]);

  const { data: prospects, loading } = useCollection<Prospect>(prospectsCollectionRef);

  const addProspect = (prospectData: Omit<Prospect, 'id'>) => {
    if (!prospectsCollectionRef) return;
    addDoc(prospectsCollectionRef, prospectData).then(docRef => {
      if (prospectData.nextContactDate) {
        addTask({
          title: `Seguimiento con ${prospectData.name}`,
          dueDate: prospectData.nextContactDate,
          status: 'pendiente',
          priority: 'high',
          client: 'Prospecto',
          description: `Realizar seguimiento del negocio: ${prospectData.businessDescription}`,
          progress: 0,
          value: 0,
          probability: 0,
          delegateTo: '',
        });
      }
    }).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: prospectsCollectionRef.path,
        operation: 'create',
        requestResourceData: prospectData,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  };

  const updateProspect = (id: string, updatedData: Partial<Omit<Prospect, 'id'>>) => {
    if (!firestore || !collectionPath) return;
    const docRef = doc(firestore, collectionPath, id);
    updateDoc(docRef, updatedData).then(() => {
      if (updatedData.nextContactDate) {
        addTask({
          title: `Seguimiento con ${updatedData.name || prospects?.find(p=>p.id===id)?.name}`,
          dueDate: updatedData.nextContactDate,
          status: 'pendiente',
          priority: 'high',
          client: 'Prospecto',
          description: `Realizar seguimiento del negocio: ${updatedData.businessDescription || prospects?.find(p=>p.id===id)?.businessDescription}`,
          progress: 0,
          value: 0,
          probability: 0,
          delegateTo: '',
        });
      }
    }).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: docRef.path,
        operation: 'update',
        requestResourceData: updatedData,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  };

  const deleteProspect = (id: string) => {
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
    prospects: prospects || [],
    loading,
    addProspect,
    updateProspect,
    deleteProspect,
  };

  return (
    <ProspectsContext.Provider value={contextValue}>{children}</ProspectsContext.Provider>
  );
}

export function useProspects() {
  const context = useContext(ProspectsContext);
  if (context === undefined) {
    throw new Error('useProspects must be used within a ProspectsProvider');
  }
  return context;
}
