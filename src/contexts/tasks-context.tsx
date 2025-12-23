'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useMemo } from 'react';
import type { Task, TeamMember, Attachment, EditLogEntry, ChangeDetail } from '@/lib/types';
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
  updateTask: (id: string, updatedData: Partial<Omit<Task, 'id'>>, user: User | null, newAttachments?: Attachment[]) => void;
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
    
    const newTask: Omit<Task, 'id'> = {
      ...taskData,
      ownerId: user.uid,
      delegatedByName: null,
      delegateToId: null,
      delegationStatus: isDelegating ? 'pending' : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editHistory: [],
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

      if (isDelegating && newTask.delegateToEmail && newTask.delegateToId) {
            try {
                const functions = getFunctions();
                const sendEmailFunction = httpsCallable(functions, 'sendEmailTask');

                const delegateUserDoc = await getDoc(doc(firestore, 'users', newTask.delegateToId));
                const delegateName = delegateUserDoc.data()?.name || 'un miembro del equipo';

                const payload = {
                    to: newTask.delegateToEmail,
                    delegateName: delegateName,
                    taskId: docRef.id,
                    taskTitle: newTask.title,
                    delegatorName: newTask.delegatedByName,
                    taskUrl: `${window.location.origin}/?task=${docRef.id}`
                };
                
                await sendEmailFunction(payload);

                toast({
                    title: "Notificación enviada",
                    description: `Se ha notificado a ${payload.delegateName} sobre la nueva tarea.`,
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
    } catch (firestoreError: any) {
      const permissionError = new FirestorePermissionError({
        path: tasksCollectionRef.path,
        operation: 'create',
        requestResourceData: newTask,
      });
      errorEmitter.emit('permission-error', permissionError);
    }
  };

  const updateTask = async (id: string, updatedData: Partial<Omit<Task, 'id'>>, user: User | null, newAttachments: Attachment[] = []) => {
    if (!firestore || !tasksCollectionRef || !user) return;
    const docRef = doc(firestore, tasksCollectionRef.path, id);
    
    // **CRITICAL FIX**: Fetch the latest version of the task directly from Firestore before updating.
    const taskSnap = await getDoc(docRef);
    if (!taskSnap.exists()) {
        console.error("Task to update does not exist:", id);
        return;
    }
    const existingTask = taskSnap.data() as Task;
    
    // --- Detailed Edit History Logic ---
    const changes: ChangeDetail[] = [];
    const fieldsToTrack = ['title', 'client', 'progress', 'priority', 'dueDate', 'status', 'value', 'probability'];
    
    fieldsToTrack.forEach(field => {
        const key = field as keyof Task;
        if (updatedData.hasOwnProperty(key) && updatedData[key] !== existingTask[key]) {
            changes.push({
                field: key,
                from: existingTask[key],
                to: updatedData[key],
            });
        }
    });

    const newEditLogEntry: EditLogEntry | null = changes.length > 0 ? {
      date: new Date().toISOString(),
      user: user.displayName || user.email || 'Unknown User',
      changes: changes
    } : null;

    const finalData: Partial<Task> = { 
        ...updatedData,
        attachments: [...(existingTask.attachments || []), ...newAttachments],
        updatedAt: new Date().toISOString(),
        editHistory: [...(existingTask.editHistory || []), ...(newEditLogEntry ? [newEditLogEntry] : [])],
    };
    
    let shouldSendEmail = false;

    // Check if the delegation email is part of the update
    if (finalData.hasOwnProperty('delegateToEmail')) {
      const newEmail = finalData.delegateToEmail;
      const oldEmail = existingTask.delegateToEmail;

      // Case 1: Delegating to a new person
      if (newEmail && newEmail !== 'null' && newEmail !== oldEmail) {
        finalData.delegationStatus = 'pending';
        const userProfileRef = doc(firestore, `users/${user.uid}`);
        const userProfileSnap = await getDoc(userProfileRef);
        finalData.delegatedByName = userProfileSnap.exists() ? userProfileSnap.data().name : user.displayName;
        
        const usersQuery = query(collection(firestore, 'users'), where('email', '==', newEmail));
        const usersSnap = await getDocs(usersQuery);
        if (!usersSnap.empty) {
          finalData.delegateToId = usersSnap.docs[0].id;
          shouldSendEmail = true;
        } else {
          finalData.delegateToId = null;
        }
      } 
      // Case 2: Removing delegation
      else if (!newEmail || newEmail === 'null') {
        finalData.delegatedByName = null;
        finalData.delegationStatus = null;
        finalData.delegateToEmail = null;
        finalData.delegateToId = null;
      }
      // Case 3: Email is the same, editing the task. Preserve the current delegation status.
      else if (newEmail === oldEmail) {
        finalData.delegationStatus = existingTask.delegationStatus;
      }
    }


    try {
        await updateDoc(docRef, finalData);

        if (shouldSendEmail && finalData.delegateToId && finalData.delegateToEmail) {
             try {
                const functions = getFunctions();
                const sendEmailFunction = httpsCallable(functions, 'sendEmailTask');
                const taskTitle = finalData.title || existingTask.title || 'una tarea';
                
                const delegateUserDoc = await getDoc(doc(firestore, 'users', finalData.delegateToId));
                const delegateName = delegateUserDoc.data()?.name || 'un miembro del equipo';

                const payload = {
                    to: finalData.delegateToEmail,
                    delegateName,
                    taskId: id,
                    taskTitle,
                    delegatorName: finalData.delegatedByName,
                    taskUrl: `${window.location.origin}/?task=${id}`
                };
                
                await sendEmailFunction(payload);

                toast({
                    title: "Notificación enviada",
                    description: `Se ha notificado a ${delegateName} sobre la tarea delegada.`,
                });
            } catch (emailError: any) {
                console.error('[updateTask] Error calling sendEmailTask:', emailError);
                toast({
                    variant: "destructive",
                    title: "Error al notificar",
                    description: "La tarea se actualizó, pero no se pudo enviar el correo de notificación. " + emailError.message,
                });
            }
        }
    } catch (serverError: any) {
        const permissionError = new FirestorePermissionError({
            path: docRef.path,
            operation: 'update',
            requestResourceData: finalData,
        });
        errorEmitter.emit('permission-error', permissionError);
    }
  };

  const bulkUpdateTasks = async (updates: { id: string, changes: Partial<Task> }[], user: User | null) => {
    if (!firestore || !tasksCollectionRef || !user) return;
    
    const batch = writeBatch(firestore);

    updates.forEach(update => {
        const docRef = doc(firestore, tasksCollectionRef.path, update.id);
        batch.update(docRef, update.changes);
    });

    batch.commit().catch(async (serverError) => {
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
