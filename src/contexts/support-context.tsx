
'use client';

import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import type { SupportTicket, Attachment } from '@/lib/types';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  where,
} from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';

interface SupportContextType {
  tickets: SupportTicket[];
  addTicket: (data: Omit<SupportTicket, 'id' | 'createdAt' | 'status' | 'creatorId' | 'creatorName' | 'creatorEmail'>, files: File[]) => Promise<void>;
  closeTicket: (id: string, solution: string, file?: File) => Promise<void>;
  loading: boolean;
}

const SupportContext = createContext<SupportContextType | undefined>(undefined);

export function SupportProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const isAdmin = user?.email === 'gdldanny@gmail.com' || user?.email === 'Roger1996.developer@gmail.com';

  const ticketsRef = useMemoFirebase(() => {
    return firestore ? collection(firestore, 'supportTickets') : null;
  }, [firestore]);

  const ticketsQuery = useMemoFirebase(() => {
    if (!ticketsRef || !user) return null;
    if (isAdmin) {
      return query(ticketsRef, orderBy('createdAt', 'desc'));
    }
    return query(ticketsRef, where('creatorId', '==', user.uid), orderBy('createdAt', 'desc'));
  }, [ticketsRef, user, isAdmin]);

  const { data: tickets, loading } = useCollection<SupportTicket>(ticketsQuery);

  const addTicket = async (data: any, files: File[]) => {
    if (!ticketsRef || !user) return;

    const newTicket: Omit<SupportTicket, 'id'> = {
      ...data,
      status: 'open',
      createdAt: new Date().toISOString(),
      creatorId: user.uid,
      creatorName: user.displayName || 'Usuario',
      creatorEmail: user.email || '',
      creatorPhone: '', // Should fetch from profile if needed
      attachments: [],
    };

    try {
      const docRef = await addDoc(ticketsRef, newTicket);
      
      if (files.length > 0) {
        const storage = getStorage();
        const attachments: Attachment[] = await Promise.all(
          files.map(async (file) => {
            const fileRef = storageRef(storage, `support_attachments/${docRef.id}/${Date.now()}_${file.name}`);
            const snap = await uploadBytes(fileRef, file);
            const url = await getDownloadURL(snap.ref);
            return { name: file.name, type: file.type, size: file.size, url };
          })
        );
        await updateDoc(docRef, { attachments });
      }
      
      toast({ title: 'Ticket Reportado', description: 'El equipo de soporte ha sido notificado.' });
    } catch (error: any) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: 'supportTickets', operation: 'create' }));
    }
  };

  const closeTicket = async (id: string, solution: string, file?: File) => {
    if (!firestore || !user) return;
    const docRef = doc(firestore, 'supportTickets', id);
    
    let solutionAttachment: Attachment | undefined;
    if (file) {
      const storage = getStorage();
      const fileRef = storageRef(storage, `support_solutions/${id}/${Date.now()}_${file.name}`);
      const snap = await uploadBytes(fileRef, file);
      const url = await getDownloadURL(snap.ref);
      solutionAttachment = { name: file.name, type: file.type, size: file.size, url };
    }

    const updateData = {
      status: 'closed' as const,
      solution,
      closedAt: new Date().toISOString(),
      closedBy: user.displayName || user.email,
      ...(solutionAttachment && { solutionAttachment }),
    };

    try {
      await updateDoc(docRef, updateData);
      toast({ title: 'Ticket Cerrado', description: 'Se ha notificado al usuario la resolución.' });
    } catch (error) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'update' }));
    }
  };

  return (
    <SupportContext.Provider value={{ tickets: tickets || [], addTicket, closeTicket, loading }}>
      {children}
    </SupportContext.Provider>
  );
}

export const useSupport = () => {
  const context = useContext(SupportContext);
  if (!context) throw new Error('useSupport must be used within SupportProvider');
  return context;
};
