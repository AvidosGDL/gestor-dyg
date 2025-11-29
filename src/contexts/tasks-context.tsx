'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useMemo } from 'react';
import type { Task } from '@/lib/types';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  serverTimestamp,
  query,
  where,
  or
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface TasksContextType {
  tasks: Task[];
  addTask: (taskData: Omit<Task, 'id'>) => void;
  updateTask: (id: string, updatedData: Partial<Omit<Task, 'id'>>) => void;
  deleteTask: (id: string) => void;
  setTasks: (tasks: Task[]) => void;
  loading: boolean;
}

const TasksContext = createContext<TasksContextType | undefined>(undefined);

export function TasksProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user } = useUser();

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

  const addTask = (taskData: Omit<Task, 'id'>) => {
    if (!tasksCollectionRef) return;
    const newTask = { ...taskData };
    addDoc(tasksCollectionRef, newTask).catch(async (serverError) => {
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
