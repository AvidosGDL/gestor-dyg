
'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useMemo } from 'react';
import type { Task, TeamMember, Attachment, EditLogEntry, ChangeDetail, RecurrenceConfig, BankTransaction } from '@/lib/types';
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
import { addDays, addWeeks, addMonths, addYears, parseISO, format } from 'date-fns';
import { useBanks } from './banks-context';


interface TasksContextType {
  tasks: Task[];
  addTask: (taskData: Partial<Omit<Task, 'id' | 'ownerId'>>, user: User | null, files: File[]) => Promise<void>;
  updateTask: (id: string, updatedData: Partial<Omit<Task, 'id'>>, user: User | null, newAttachments?: Attachment[]) => Promise<void>;
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
        taskUrl: `https://gestor.fiscalflow.mx/?task=${taskId}`,
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

function calculateNextOccurrenceDate(currentDateStr: string, config: RecurrenceConfig): string {
    const currentDate = parseISO(currentDateStr);
    let nextDate: Date;

    switch (config.frequency) {
        case 'daily':
            nextDate = addDays(currentDate, config.interval);
            break;
        case 'weekly':
            nextDate = addWeeks(currentDate, config.interval);
            break;
        case 'monthly':
            nextDate = addMonths(currentDate, config.interval);
            break;
        case 'yearly':
            nextDate = addYears(currentDate, config.interval);
            break;
        default:
            nextDate = addMonths(currentDate, 1);
    }

    return format(nextDate, 'yyyy-MM-dd');
}


export function TasksProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();
  const { addBankTransaction, bankAccounts } = useBanks();

  const tasksCollectionRef = useMemoFirebase(() => {
    return firestore ? collection(firestore, 'tasks') : null;
  }, [firestore]);

  // IDs de cuentas bancarias accesibles para visibilidad compartida financiera
  const accessibleBankIds = useMemo(() => bankAccounts.map(b => b.id), [bankAccounts]);

  // Miembros de mi equipo para visibilidad de gestión (Boss View)
  const myTeamCollectionRef = useMemoFirebase(() => {
    return (user && firestore) ? collection(firestore, `users/${user.uid}/teamMembers`) : null;
  }, [user, firestore]);
  const { data: members } = useCollection<TeamMember>(myTeamCollectionRef);
  const teamMemberIds = useMemo(() => members?.map(m => m.uid).filter(Boolean) || [], [members]);

  // CONSULTA 1: Tareas Personales y Financieras
  const personalTasksQuery = useMemoFirebase(() => {
    if (!user || !tasksCollectionRef) return null;
    
    const filters = [
      where('ownerId', '==', user.uid),
      where('delegateToId', '==', user.uid)
    ];

    if (accessibleBankIds.length > 0) {
      filters.push(where('linkedBankAccountId', 'in', accessibleBankIds.slice(0, 28)));
    }

    return query(tasksCollectionRef, or(...filters));
  }, [user, tasksCollectionRef, accessibleBankIds]);

  // CONSULTA 2: Tareas de Gestión (lo que mi equipo está haciendo)
  const teamTasksQuery = useMemoFirebase(() => {
    if (!user || !tasksCollectionRef || teamMemberIds.length === 0) return null;
    
    // Traer tareas donde cualquier miembro de mi equipo actual es el delegado
    // Esto asegura que si cambio de jefe a alguien, el nuevo jefe vea sus tareas de inmediato
    return query(tasksCollectionRef, where('delegateToId', 'in', teamMemberIds.slice(0, 30)));
  }, [user, tasksCollectionRef, teamMemberIds]);

  const { data: personalTasks, loading: personalLoading } = useCollection<Task>(personalTasksQuery);
  const { data: teamTasks, loading: teamLoading } = useCollection<Task>(teamTasksQuery);

  // Fusión de tareas evitando duplicados por ID
  const allTasksMerged = useMemo(() => {
    const map = new Map<string, Task>();
    (personalTasks || []).forEach(t => map.set(t.id, t));
    (teamTasks || []).forEach(t => map.set(t.id, t));
    return Array.from(map.values());
  }, [personalTasks, teamTasks]);

  const addTask = async (taskData: any, user: User | null, files: File[] = []) => {
    if (!tasksCollectionRef || !user || !firestore) return;

    const isDelegating = taskData.delegateToData && taskData.delegateToData !== 'none';
    
    let delegateToEmail: string | null = null;
    let delegateToId: string | null = null;

    if (isDelegating) {
        const [email, id] = taskData.delegateToData.split('|');
        delegateToEmail = email;
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
      isRecurring: taskData.isRecurring || false,
      recurrenceConfig: taskData.recurrenceConfig || null,
      linkedBankAccountId: taskData.linkedBankAccountId || null,
      financialMovementType: taskData.financialMovementType || null,
    };
    
    if (isDelegating && newTask.delegatedByName === (user.displayName || 'un administrador')) {
        const userProfileRef = doc(firestore, `users/${user.uid}`);
        const userProfileSnap = await getDoc(userProfileRef);
        if (userProfileSnap.exists()) {
            newTask.delegatedByName = userProfileSnap.data().name;
        }
    }


    try {
      const docRef = await addDoc(tasksCollectionRef, newTask);
      const taskId = docRef.id;

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
        await updateDoc(docRef, { attachments: newAttachments });
      }

      if (isDelegating && newTask.delegateToId) {
        const emailResult = await sendDelegationEmail(firestore, user, newTask, taskId);
        if (emailResult.success) {
            toast({
                title: "Notificación enviada",
                description: `Se ha notificado a ${emailResult.delegateName} sobre la nueva tarea.`,
            });
        }
      }
    } catch (error: any) {
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
    
    const taskSnap = await getDoc(docRef);
    if (!taskSnap.exists()) return;
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

    Object.keys(finalData).forEach(key => {
      if (finalData[key] === undefined) delete finalData[key];
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
    }


    try {
        await updateDoc(docRef, finalData);
        
        if (finalData.status === 'completado' && (existingTask.linkedBankAccountId || finalData.linkedBankAccountId)) {
            const bankId = finalData.linkedBankAccountId || existingTask.linkedBankAccountId;
            const moveType = finalData.financialMovementType || existingTask.financialMovementType;
            const amount = finalData.value || existingTask.value;

            if (bankId && moveType && amount > 0) {
                const transactionData: Omit<BankTransaction, 'id' | 'source' | 'createdBy' | 'sortOrder'> = {
                    date: new Date().toISOString(),
                    description: `[AUTOMÁTICO] Tarea: ${finalData.title || existingTask.title}`,
                    amount: amount,
                    type: moveType as 'ingreso' | 'egreso',
                    entityName: finalData.client || existingTask.client || 'Vínculo Tarea',
                };
                await addBankTransaction(bankId, transactionData, { validationStatus: 'pending' });
            }
        }

        if (finalData.status === 'completado' && existingTask.isRecurring && existingTask.recurrenceConfig) {
            const nextDueDate = calculateNextOccurrenceDate(existingTask.dueDate || format(new Date(), 'yyyy-MM-dd'), existingTask.recurrenceConfig);
            const nextTaskData = {
                title: existingTask.title,
                client: existingTask.client,
                progress: 0,
                priority: existingTask.priority,
                dueDate: nextDueDate,
                status: 'pendiente',
                description: existingTask.description,
                value: existingTask.value,
                probability: existingTask.probability,
                isRecurring: true,
                recurrenceConfig: existingTask.recurrenceConfig,
                delegateToData: existingTask.delegateToEmail && existingTask.delegateToId ? `${existingTask.delegateToEmail}|${existingTask.delegateToId}` : 'none',
                linkedBankAccountId: existingTask.linkedBankAccountId || null,
                financialMovementType: existingTask.financialMovementType || null,
            };
            await addTask(nextTaskData, user, []);
        }

    } catch (error: any) {
        if (error.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
                path: docRef.path,
                operation: 'update',
                requestResourceData: finalData,
            });
            errorEmitter.emit('permission-error', permissionError);
        }
        return;
    }

    if (shouldSendEmail) {
        try {
            const taskWithUpdates = { ...existingTask, ...finalData };
            await sendDelegationEmail(firestore, user, taskWithUpdates, id);
        } catch (emailError: any) {
            console.error('[updateTask] Error calling sendEmailTask:', emailError);
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
          if ((sanitizedChanges as any)[key] === undefined) delete (sanitizedChanges as any)[key];
        });
        batch.update(docRef, sanitizedChanges);
    });
    batch.commit().catch(async (serverError) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: tasksCollectionRef.path, operation: 'update' }));
    });
  };

  const deleteTask = async (id: string) => {
    if (!firestore || !tasksCollectionRef) return;
    const taskToDeleteRef = doc(firestore, 'tasks', id);
    const deletedTaskRef = doc(firestore, 'taskHistory', id);

    try {
        const taskDoc = await getDoc(taskToDeleteRef);
        if (!taskDoc.exists()) throw new Error("La tarea no existe.");
        const taskData = taskDoc.data();
        const batch = writeBatch(firestore);
        batch.set(deletedTaskRef, taskData);
        batch.delete(taskToDeleteRef);
        await batch.commit();
        toast({ title: 'Tarea archivada' });
    } catch (error: any) {
        if (error.code === 'permission-denied') {
            errorEmitter.emit('permission-error', new FirestorePermissionError({ path: taskToDeleteRef.path, operation: 'delete' }));
        }
    }
  };


  const setTasks = (newTasks: Task[]) => {
    if (setTasksState) setTasksState(newTasks);
  };

  const contextValue = useMemo(() => ({
    tasks: allTasksMerged,
    loading: personalLoading || teamLoading,
    setTasks,
    addTask,
    updateTask,
    bulkUpdateTasks,
    deleteTask,
  }), [allTasksMerged, personalLoading, teamLoading]);

  return (
    <TasksContext.Provider value={contextValue}>{children}</TasksContext.Provider>
  );
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (context === undefined) throw new Error('useTasks must be used within a TasksProvider');
  return context;
}
