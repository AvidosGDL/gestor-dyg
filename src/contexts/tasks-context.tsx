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
import { User } from 'firebase/auth';


interface TasksContextType {
  tasks: Task[];
  addTask: (taskData: Omit<Task, 'id'>, member: TeamMember | null, user: User | null) => void;
  updateTask: (id: string, updatedData: Partial<Omit<Task, 'id'>>, user: User | null) => void;
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

  const addTask = async (taskData: Omit<Task, 'id'>, member: TeamMember | null, user: User | null) => {
    if (!tasksCollectionRef || !user || !firestore) return;

    const isDelegating = !!taskData.delegateToId && taskData.delegateToId !== 'null';
    let delegatedByName: string | null = null;
    
    if (isDelegating) {
      delegatedByName = user.displayName;
    }

    const newTask: Omit<Task, 'id'> = {
      ...taskData,
      ownerId: user.uid,
      delegatedByName: delegatedByName,
      delegationStatus: isDelegating ? 'pending' : null,
    };

    try {
      const docRef = await addDoc(tasksCollectionRef, newTask);

      if (isDelegating && member) {
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

        } catch (emailError: any) {
           console.error('[addTask] Error calling sendEmailTask:', {
             error: emailError instanceof Error ? { message: emailError.message, stack: emailError.stack } : emailError,
           });
           toast({
            variant: "destructive",
            title: "Error al notificar",
            description: "La tarea se creó, pero no se pudo enviar el correo de notificación. " + emailError.message,
          });
        }
      }
    } catch (firestoreError: any) {
      const permissionError = new FirestorePermissionError({
        path: tasksCollectionRef.path,
        operation: 'create',
        requestResourceData: newTask,
      });
      errorEmitter.emit('permission-error', permissionError);
    }
  };

  const updateTask = async (id: string, updatedData: Partial<Omit<Task, 'id'>>, user: User | null) => {
    if (!firestore || !tasksCollectionRef || !user) return;
    const docRef = doc(firestore, tasksCollectionRef.path, id);
    
    const finalData = { ...updatedData };
    const isDelegating = finalData.hasOwnProperty('delegateToId');

    if (isDelegating) {
        if (finalData.delegateToId && finalData.delegateToId !== 'null') {
            finalData.delegationStatus = 'pending';
            finalData.delegatedByName = user.displayName;
        } else {
            finalData.delegatedByName = null;
            finalData.delegationStatus = null;
            finalData.delegateToId = null;
        }
    }

    updateDoc(docRef, finalData).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: docRef.path,
        operation: 'update',
        requestResourceData: finalData,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  };

  const deleteTask = async (id: string) => {
    if (!firestore || !tasksCollectionRef) return;
    const taskToDeleteRef = doc(firestore, 'tasks', id);
    const deletedTaskRef = doc(firestore, 'taskHistory', id);

    try {
        const taskDoc = await getDoc(taskToDeleteRef);
        if (!taskDoc.exists()) {
            throw new Error("La tarea no existe.");
        }
        
        const taskData = taskDoc.data();

        const batch = writeBatch(firestore);
        batch.set(deletedTaskRef, taskData);
        batch.delete(taskToDeleteRef);
        
        await batch.commit();

        toast({
            title: 'Tarea archivada',
            description: 'La tarea ha sido movida al histórico.',
        });
    } catch (error: any) {
        console.error("Error al mover la tarea: ", error);
        if (error.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
                path: taskToDeleteRef.path,
                operation: 'delete',
            });
            errorEmitter.emit('permission-error', permissionError);
        } else {
            toast({
                variant: "destructive",
                title: "Error al archivar",
                description: "No se pudo mover la tarea. " + error.message,
            });
        }
    }
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
