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
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";


interface TasksContextType {
  tasks: Task[];
  addTask: (taskData: Partial<Omit<Task, 'id' | 'ownerId'>>, user: User | null, files: File[]) => void;
  updateTask: (id: string, updatedData: Partial<Omit<Task, 'id'>>, user: User | null, newAttachments?: Attachment[]) => void;
  bulkUpdateTasks: (updates: { id: string, changes: Partial<Task> }[], user: User | null) => void;
  deleteTask: (id: string) => void;
  setTasks: (tasks: Task[]) => void;
  loading: boolean;
}

const TasksContext = createContext<TasksContextType | undefined>(undefined);

// Helper function to send delegation email to avoid code duplication
async function sendDelegationEmail(firestore: any, user: User, task: Partial<Task>, taskId: string) {
    if (!task.delegateToEmail || !task.delegateToId) {
        console.error("Missing delegation info to send email.");
        return { success: false, error: new Error("Missing delegation info.") };
    }

    const functions = getFunctions();
    const sendEmailFunction = httpsCallable(functions, 'sendEmailTask');

    const delegateUserDoc = await getDoc(doc(firestore, 'users', task.delegateToId));
    const delegateName = delegateUserDoc.data()?.name || 'un miembro del equipo';

    const delegatorName = task.delegatedByName || user?.displayName || 'un administrador';

    const payload = {
        to: task.delegateToEmail,
        delegateName: delegateName,
        taskId: taskId,
        taskTitle: task.title,
        delegatorName: delegatorName,
        taskUrl: `${window.location.origin}/?task=${taskId}`,
        delegateId: task.delegateToId
    };

    try {
        const result = await sendEmailFunction(payload);
        return { success: true, delegateName: delegateName };
    } catch (emailError: any) {
        console.error('Error calling sendEmailTask:', emailError);
        return { success: false, error: emailError };
    }
}


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

  const addTask = async (taskData: any, user: User | null, files: File[] = []) => {
    if (!tasksCollectionRef || !user || !firestore) return;

    const isDelegating = taskData.delegateToData && taskData.delegateToData !== 'none';
    
    let delegateToEmail: string | null = null;
    let delegateToId: string | null = null;

    if (isDelegating) {
        const [email, id] = taskData.delegateToData.split('|');
        delegateToEmail = email;
        // Protection against "undefined" string
        delegateToId = (id && id !== 'undefined') ? id : null;
    }
    
    const newTask: Omit<Task, 'id'> = {
      title: taskData.title || 'Nueva Tarea',
      client: taskData.client || '',
      progress: taskData.progress || 0,
      priority: taskData.priority || 'medium',
      dueDate: taskData.dueDate || '',
      status: taskData.status || 'pendiente',
      description: taskData.description || '',
      value: taskData.value || 0,
      probability: taskData.probability || 50,
      ownerId: user.uid,
      delegatedByName: isDelegating ? (user.displayName || 'un administrador') : null,
      delegateToId: isDelegating ? delegateToId : null,
      delegationStatus: isDelegating ? 'pending' : null,
      delegateToEmail: isDelegating ? delegateToEmail : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editHistory: [],
      attachments: [],
    };
    
    if (isDelegating && newTask.delegatedByName === (user.displayName || 'un administrador')) {
        const userProfileRef = doc(firestore, `users/${user.uid}`);
        const userProfileSnap = await getDoc(userProfileRef);
        if (userProfileSnap.exists()) {
            newTask.delegatedByName = userProfileSnap.data().name;
        }
    }


    try {
      // Step 1: Create the task document to get an ID.
      const docRef = await addDoc(tasksCollectionRef, newTask);
      const taskId = docRef.id;

      // Step 2: If there are files, upload them now that we have a taskId.
      let newAttachments: Attachment[] = [];
      if (files.length > 0) {
        const storage = getStorage();
        const uploadPromises = files.map(async file => {
          const fileRef = storageRef(storage, `task_attachments/${taskId}/${Date.now()}_${file.name}`);
          const snapshot = await uploadBytes(fileRef, file);
          const downloadURL = await getDownloadURL(snapshot.ref);
          return {
            name: file.name,
            type: file.type,
            size: file.size,
            url: downloadURL,
          };
        });
        newAttachments = await Promise.all(uploadPromises);

        // Step 3: Update the task document with the attachment URLs.
        await updateDoc(docRef, { attachments: newAttachments });
      }

      // Step 4: Handle delegation email if necessary.
      if (isDelegating && newTask.delegateToId) {
        const emailResult = await sendDelegationEmail(firestore, user, newTask, taskId);
        if (emailResult.success) {
            toast({
                title: "Notificación enviada",
                description: `Se ha notificado a ${emailResult.delegateName} sobre la nueva tarea.`,
            });
        } else {
            throw emailResult.error; // Throw to be caught by the outer catch block
        }
      }
    } catch (error: any) {
      if (error.code && error.message) { // Likely a Firebase error from sendDelegationEmail
        console.error('[addTask] Error calling sendEmailTask:', error);
        toast({
            variant: "destructive",
            title: "Error al notificar",
            description: "La tarea se creó, pero no se pudo enviar el correo. " + error.message,
        });
      } else { // Firestore permission error or other issue
        const permissionError = new FirestorePermissionError({
          path: tasksCollectionRef.path,
          operation: 'create',
          requestResourceData: newTask,
        });
        errorEmitter.emit('permission-error', permissionError);
      }
    }
  };

  const updateTask = async (id: string, updatedData: Partial<Omit<Task, 'id'>>, user: User | null, newAttachments: Attachment[] = []) => {
    if (!firestore || !tasksCollectionRef || !user) return;
    const docRef = doc(firestore, tasksCollectionRef.path, id);
    
    const taskSnap = await getDoc(docRef);
    if (!taskSnap.exists()) {
        console.error("Task to update does not exist:", id);
        return;
    }
    const existingTask = taskSnap.data() as Task;
    
    const changes: ChangeDetail[] = [];
    const fieldsToTrack = ['title', 'client', 'progress', 'priority', 'dueDate', 'status', 'value', 'probability', 'delegateToEmail'];
    
    fieldsToTrack.forEach(field => {
        const key = field as keyof Task;
        if (updatedData.hasOwnProperty(key) && updatedData[key] !== existingTask[key]) {
            changes.push({
                field: key,
                from: existingTask[key] || null,
                to: updatedData[key] === undefined ? null : updatedData[key],
            });
        }
    });

    const newEditLogEntry: EditLogEntry | null = changes.length > 0 ? {
      date: new Date().toISOString(),
      user: user.displayName || user.email || 'Unknown User',
      changes: changes
    } : null;

    const finalData: any = { 
        ...updatedData,
        attachments: [...(existingTask.attachments || []), ...newAttachments],
        editHistory: [...(existingTask.editHistory || []), ...(newEditLogEntry ? [newEditLogEntry] : [])],
    };
    
    if (!('updatedAt' in updatedData)) {
      finalData.updatedAt = new Date().toISOString();
    }

    // CRITICAL FIX: Sanitización para evitar valores 'undefined' que Firestore rechaza
    Object.keys(finalData).forEach(key => {
      if (finalData[key] === undefined) {
        delete finalData[key];
      }
    });

    let shouldSendEmail = false;

    if (finalData.hasOwnProperty('delegateToEmail')) {
      const newEmail = finalData.delegateToEmail;
      const oldEmail = existingTask.delegateToEmail;

      if (newEmail && newEmail !== 'none' && newEmail !== oldEmail && finalData.delegateToId) {
        finalData.delegationStatus = 'pending';
        const userProfileRef = doc(firestore, `users/${user.uid}`);
        const userProfileSnap = await getDoc(userProfileRef);
        finalData.delegatedByName = userProfileSnap.exists() ? userProfileSnap.data().name : user.displayName;
        
        shouldSendEmail = true;

      } 
      else if (newEmail === 'none' || newEmail === null) {
        finalData.delegatedByName = null;
        finalData.delegationStatus = null;
        finalData.delegateToEmail = null;
        finalData.delegateToId = null;
      }
      else if (newEmail === oldEmail) {
        finalData.delegationStatus = existingTask.delegationStatus;
      }
    }


    try {
        await updateDoc(docRef, finalData);
    } catch (error: any) {
        console.error("Error al actualizar Firestore:", error);
        toast({
            variant: "destructive",
            title: "Error al actualizar tarea",
            description: error.message || "No se pudo guardar la tarea en la base de datos.",
        });
        
        if (error.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
                path: docRef.path,
                operation: 'update',
                requestResourceData: finalData,
            });
            errorEmitter.emit('permission-error', permissionError);
        }
        return; // Detener flujo si falla Firestore
    }

    // Solo intentar enviar notificación si Firestore se actualizó correctamente
    if (shouldSendEmail) {
        try {
            const taskWithUpdates = { ...existingTask, ...finalData };
            const emailResult = await sendDelegationEmail(firestore, user, taskWithUpdates, id);

            if (emailResult.success) {
                toast({
                    title: "Notificación enviada",
                    description: `Se ha notificado a ${emailResult.delegateName} sobre la tarea delegada.`,
                });
            } else {
                 throw emailResult.error;
            }
        } catch (emailError: any) {
            console.error('[updateTask] Error calling sendEmailTask:', emailError);
            toast({
                variant: "destructive",
                title: "Error al notificar",
                description: "La tarea se guardó, pero no se pudo enviar el correo de notificación. " + emailError.message,
            });
        }
    }
  };

  const bulkUpdateTasks = async (updates: { id: string, changes: Partial<Task> }[], user: User | null) => {
    if (!firestore || !tasksCollectionRef || !user) return;
    
    const batch = writeBatch(firestore);

    updates.forEach(update => {
        const docRef = doc(firestore, tasksCollectionRef.path, update.id);
        const sanitizedChanges = { ...update.changes };
        Object.keys(sanitizedChanges).forEach(key => {
          if ((sanitizedChanges as any)[key] === undefined) {
            delete (sanitizedChanges as any)[key];
          }
        });
        batch.update(docRef, sanitizedChanges);
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
