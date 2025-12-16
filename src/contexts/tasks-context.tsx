'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useMemo } from 'react';
import type { Task, TeamMember, UserProfile } from '@/lib/types';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  query,
  where,
  or,
  getDoc,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';


interface TasksContextType {
  tasks: Task[];
  addTask: (taskData: Omit<Task, 'id' | 'ownerId'>, member?: TeamMember | null) => void;
  updateTask: (id: string, updatedData: Partial<Omit<Task, 'id' | 'ownerId'>>) => void;
  deleteTask: (id: string) => void;
  setTasks: (tasks: Task[]) => void;
  loading: boolean;
}

const TasksContext = createContext<TasksContextType | undefined>(undefined);

export function TasksProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const tasksCollectionRef = useMemoFirebase(() => {
    return firestore ? collection(firestore, 'tasks') : null;
  }, [firestore]);

  const tasksQuery = useMemoFirebase(() => {
    if (!user || !tasksCollectionRef) return null;
    return query(tasksCollectionRef, 
      or(
        where('ownerId', '==', user.uid),
        where('delegateToId', '==', user.uid)
      )
    );
  }, [user, tasksCollectionRef]);

  const {
    data: tasks,
    loading,
  } = useCollection<Task>(tasksQuery);

  const addTask = async (taskData: Partial<Omit<Task, 'id'>>, member?: TeamMember | null) => {
    if (!tasksCollectionRef || !user) return;
    
    const newTask: Partial<Task> = { 
      ...taskData, 
      ownerId: user.uid,
    };

    if (taskData.delegateToId) {
      // Use the displayName from the current authenticated user object. It's the most reliable source.
      newTask.delegatedByName = user.displayName || null;
      newTask.delegationStatus = 'pending';
    } else {
      newTask.delegationStatus = null;
      newTask.delegatedByName = null;
    }


    addDoc(tasksCollectionRef, newTask as Task).then(async (docRef) => {
      if (newTask.delegateToId && member) {
        try {
          const functions = getFunctions();
          const sendEmailFunction = httpsCallable(functions, 'sendEmailTask');
          
          const payload = {
            to: member.email,
            delegateName: member.name,
            taskId: docRef.id,
            taskTitle: newTask.title,
            delegatorName: newTask.delegatedByName,
          };
          
          const result: any = await sendEmailFunction(payload);

          if (!result.data.success) {
            throw new Error(result.data.error || 'La Cloud Function reportó un error sin mensaje.');
          }

          toast({
            title: "Notificación enviada",
            description: `Se ha notificado a ${member.name} sobre la nueva tarea.`,
          });

        } catch (error: any) {
           console.error('[addTask] Error calling sendEmailTask:', {
             error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
           });
           toast({
            variant: "destructive",
            title: "Error al notificar",
            description: "No se pudo enviar el correo de notificación. " + error.message,
          });
        }
      }

    }).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: tasksCollectionRef.path,
        operation: 'create',
        requestResourceData: newTask,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  };

  const updateTask = async (id: string, updatedData: Partial<Omit<Task, 'id' | 'ownerId'>>) => {
    if (!firestore || !tasksCollectionRef || !user) return;
    const docRef = doc(firestore, tasksCollectionRef.path, id);
    
    const finalData = { ...updatedData };
    const originalTask = tasks?.find(t => t.id === id);

    // If delegateToId is being changed...
    if ('delegateToId' in finalData) {
      // If a NEW delegate is being assigned
      if (finalData.delegateToId && (!originalTask || originalTask.delegateToId !== finalData.delegateToId)) {
        // Use the displayName from the current authenticated user object.
        finalData.delegatedByName = user.displayName || null;
        finalData.delegationStatus = 'pending';
      } 
      // If delegation is being REMOVED
      else if (finalData.delegateToId === null || finalData.delegateToId === 'null') {
        finalData.delegateToId = null;
        finalData.delegatedByName = null;
        finalData.delegationStatus = null;
      }
    }

    updateDoc(docRef, finalData).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: docRef.path,
        operation: 'update',
        requestResourceData: updatedData,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  };

  const deleteTask = (id: string) => {
    if (!firestore || !tasksCollectionRef) return;
    const docRef = doc(firestore, tasksCollectionRef.path, id);
    deleteDoc(docRef).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: docRef.path,
        operation: 'delete',
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  };

  const setTasks = (newTasks: Task[]) => {
    if (!firestore || !tasksCollectionRef) return;
    const batch = writeBatch(firestore);
    
    tasks?.forEach(task => {
      const docRef = doc(firestore, tasksCollectionRef.path, task.id);
      batch.delete(docRef);
    });

    newTasks.forEach(task => {
        const { id, ...taskData } = task;
        const docRef = doc(tasksCollectionRef);
        batch.set(docRef, taskData);
    });

    batch.commit().catch(async (serverError) => {
         const permissionError = new FirestorePermissionError({
            path: tasksCollectionRef.path,
            operation: 'write', 
            requestResourceData: newTasks
        });
        errorEmitter.emit('permission-error', permissionError);
    });
  };

  const contextValue = useMemo(() => ({
    tasks: tasks || [],
    loading,
    setTasks,
    addTask,
    updateTask,
    deleteTask,
  }), [tasks, loading]);

  return (
    <TasksContext.Provider value={contextValue}>{children}</TasksContext.Provider>
  );
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (context === undefined) {
    throw new Error('useTasks must be used within a TasksProvider');
  }
  return context;
}
