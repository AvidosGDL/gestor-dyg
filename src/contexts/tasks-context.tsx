'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useMemo } from 'react';
import type { Task, TeamMember } from '@/lib/types';
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
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';


interface TasksContextType {
  tasks: Task[];
  addTask: (taskData: Omit<Task, 'id'>, member?: TeamMember | null) => void;
  updateTask: (id: string, updatedData: Partial<Omit<Task, 'id'>>) => void;
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

  // Consulta para obtener todas las tareas donde el usuario actual es el propietario.
  // Esto permite al manager ver todas las tareas que ha creado, incluyendo las delegadas.
  const tasksQuery = useMemoFirebase(() => {
    if (!user || !tasksCollectionRef) return null;
    return query(tasksCollectionRef, where('ownerId', '==', user.uid));
  }, [user, tasksCollectionRef]);

  const {
    data: tasks,
    loading,
  } = useCollection<Task>(tasksQuery);

  const addTask = (taskData: Omit<Task, 'id'>, member?: TeamMember | null) => {
    if (!tasksCollectionRef || !user) return;
    const newTask = { ...taskData, ownerId: user.uid };
    addDoc(tasksCollectionRef, newTask).then(async (docRef) => {
      if (newTask.delegateToId && member) {
        try {
          const functions = getFunctions();
          const sendEmailFunction = httpsCallable(functions, 'sendTaskDelegationEmailCallable');
          
          const payload = {
            to: member.email,
            delegateName: member.name,
            taskId: docRef.id,
            taskTitle: newTask.title,
            delegatorName: user.displayName || 'un administrador',
          };
          
          const result: any = await sendEmailFunction(payload);

          if (!result.data.ok) {
            throw new Error(result.data.error || 'La Cloud Function reportó un error sin mensaje.');
          }

          toast({
            title: "Notificación enviada",
            description: `Se ha notificado a ${member.name} sobre la nueva tarea.`,
          });

        } catch (error: any) {
           console.error('[addTask] Error calling sendTaskDelegationEmailCallable:', {
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

  const updateTask = (id: string, updatedData: Partial<Omit<Task, 'id'>>) => {
    if (!firestore || !tasksCollectionRef) return;
    const docRef = doc(firestore, tasksCollectionRef.path, id);
    updateDoc(docRef, updatedData).catch(async (serverError) => {
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
