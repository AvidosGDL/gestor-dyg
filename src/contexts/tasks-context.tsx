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
  or,
  getDoc,
  getDocs,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';
import { User } from 'firebase/auth';


interface TasksContextType {
  tasks: Task[];
  addTask: (taskData: Omit<Task, 'id'>, user: User | null) => void;
  updateTask: (id: string, updatedData: Partial<Omit<Task, 'id'>>, user: User | null) => void;
  bulkUpdateTasks: (updates: { id: string, changes: Partial<Task> }[], user: User | null) => void;
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
    setData: setTasksState,
  } = useCollection<Task>(tasksQuery);

  const addTask = async (taskData: Omit<Task, 'id'>, user: User | null) => {
    if (!tasksCollectionRef || !user || !firestore) return;

    const isDelegating = !!taskData.delegateToEmail;
    
    const newTask: Omit<Task, 'id' | 'delegatedByName' | 'delegateToId'> & { delegatedByName: string | null; delegateToId: string | null; } = {
      ...taskData,
      ownerId: user.uid,
      delegatedByName: null,
      delegateToId: null,
      delegationStatus: isDelegating ? 'pending' : null,
    };

    if (isDelegating) {
      // Get delegator name from their profile
      const userProfileRef = doc(firestore, `users/${user.uid}`);
      const userProfileSnap = await getDoc(userProfileRef);
      if (userProfileSnap.exists()) {
        newTask.delegatedByName = userProfileSnap.data().name;
      } else {
        newTask.delegatedByName = user.displayName; // Fallback
      }

      // Check if delegated user exists to get their UID
      const usersQuery = query(collection(firestore, 'users'), where('email', '==', taskData.delegateToEmail));
      const usersSnap = await getDocs(usersQuery);
      if (!usersSnap.empty) {
        const delegatedUserDoc = usersSnap.docs[0];
        newTask.delegateToId = delegatedUserDoc.id;
      }
    }

    try {
      const docRef = await addDoc(tasksCollectionRef, newTask);

      if (isDelegating && newTask.delegateToEmail) {
         // Find the team member to get their name for the email
        const membersQuery = query(collection(firestore, `users/${user.uid}/teamMembers`), where('email', '==', newTask.delegateToEmail));
        const membersSnap = await getDocs(membersQuery);
        
        if (!membersSnap.empty) {
            const member = membersSnap.docs[0].data() as TeamMember;
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
                    throw new Error(result.data.error || 'La Cloud Function reportó un error.');
                }

                toast({
                    title: "Notificación enviada",
                    description: `Se ha notificado a ${member.name} sobre la nueva tarea.`,
                });
            } catch (emailError: any) {
                console.error('[addTask] Error calling sendEmailTask:', emailError);
                toast({
                    variant: "destructive",
                    title: "Error al notificar",
                    description: "La tarea se creó, pero no se pudo enviar el correo. " + emailError.message,
                });
            }
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
    const isDelegating = finalData.hasOwnProperty('delegateToEmail');

    if (isDelegating) {
        if (finalData.delegateToEmail && finalData.delegateToEmail !== 'null') {
            finalData.delegationStatus = 'pending';
             // Set delegator name
             const userProfileRef = doc(firestore, `users/${user.uid}`);
             const userProfileSnap = await getDoc(userProfileRef);
             if (userProfileSnap.exists()) {
                 finalData.delegatedByName = userProfileSnap.data().name;
             } else {
                 finalData.delegatedByName = user.displayName; // Fallback
             }
             // Find delegatee UID
             const usersQuery = query(collection(firestore, 'users'), where('email', '==', finalData.delegateToEmail));
             const usersSnap = await getDocs(usersQuery);
             if (!usersSnap.empty) {
                finalData.delegateToId = usersSnap.docs[0].id;
             } else {
                finalData.delegateToId = null; // User not registered yet
             }
        } else {
            finalData.delegatedByName = null;
            finalData.delegationStatus = null;
            finalData.delegateToEmail = null;
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

  const bulkUpdateTasks = async (updates: { id: string, changes: Partial<Task> }[], user: User | null) => {
    if (!firestore || !tasksCollectionRef || !user) return;
    
    const batch = writeBatch(firestore);

    updates.forEach(update => {
        const docRef = doc(firestore, tasksCollectionRef.path, update.id);
        batch.update(docRef, update.changes);
    });

    batch.commit().catch(async (serverError) => {
      // Note: This error handling is simplified. A real app might need more granular error reporting.
      const permissionError = new FirestorePermissionError({
        path: tasksCollectionRef.path,
        operation: 'update',
        requestResourceData: {info: 'Bulk update operation failed'},
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
    // This is a dangerous operation. It's better to update the state locally.
    // The useCollection hook already handles real-time updates.
    // If you need to reorder, you can update a local state derived from the hook's data.
    // For now, we will update the local state to reflect reordering.
    if (setTasksState) {
        setTasksState(newTasks);
    }
  };

  const contextValue = useMemo(() => ({
    tasks: tasks || [],
    loading,
    setTasks,
    addTask,
    updateTask,
    bulkUpdateTasks,
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
