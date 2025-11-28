'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useMemo } from 'react';
import type { Task } from '@/lib/types';
import { useCollection, useFirestore, useUser } from '@/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
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

  const collectionPath = user ? `users/${user.uid}/tasks` : null;

  const {
    data: tasks,
    loading,
    error,
  } = useCollection<Task>(collectionPath);

  const tasksCollection = useMemo(() => {
    if (!firestore || !collectionPath) return null;
    return collection(firestore, collectionPath);
  }, [firestore, collectionPath]);

  const addTask = (taskData: Omit<Task, 'id'>) => {
    if (!tasksCollection) return;
    const newTask = { ...taskData, createdAt: new Date().toISOString() };
    addDoc(tasksCollection, newTask).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: tasksCollection.path,
        operation: 'create',
        requestResourceData: newTask,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  };

  const updateTask = (id: string, updatedData: Partial<Omit<Task, 'id'>>) => {
    if (!firestore || !collectionPath) return;
    const docRef = doc(firestore, collectionPath, id);
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

  const setTasks = (newTasks: Task[]) => {
    if (!firestore || !collectionPath) return;
    const batch = writeBatch(firestore);
    
    // This is a simplified batch update. It deletes old tasks and adds new ones.
    // A more sophisticated approach would be to diff the arrays.
    tasks?.forEach(task => {
      const docRef = doc(firestore, collectionPath, task.id);
      batch.delete(docRef);
    });

    newTasks.forEach(task => {
        const { id, ...taskData } = task;
        // If the task has a numeric ID from old data, we create a new doc
        const docRef = doc(tasksCollection);
        batch.set(docRef, taskData);
    });

    batch.commit().catch(async (serverError) => {
         const permissionError = new FirestorePermissionError({
            path: collectionPath,
            operation: 'update', // or a more generic 'write'
            requestResourceData: newTasks
        });
        errorEmitter.emit('permission-error', permissionError);
    });
  };

  const contextValue = {
    tasks: tasks || [],
    loading,
    setTasks,
    addTask,
    updateTask,
    deleteTask,
  };

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