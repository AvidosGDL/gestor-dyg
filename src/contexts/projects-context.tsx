

'use client';

import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import type { Project, ProjectActivity, Attachment } from '@/lib/types';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
} from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';

interface ProjectsContextType {
  projects: Project[];
  addProject: (projectData: Omit<Project, 'id' | 'ownerId'>) => Promise<string | null>;
  addActivity: (projectId: string, activityData: Omit<ProjectActivity, 'id'>) => void;
  updateActivity: (projectId: string, activityId: string, updatedData: Partial<Omit<ProjectActivity, 'id'>>, newFiles: File[]) => Promise<void>;
  deleteProject: (id: string) => void;
  importProjectFromCSV: (projectName: string, activities: Omit<ProjectActivity, 'id'>[]) => Promise<void>;
  getActivitiesForProject: (projectId: string) => { activities: ProjectActivity[], loading: boolean };
  loading: boolean;
}

const ProjectsContext = createContext<ProjectsContextType | undefined>(undefined);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { toast } = useToast();

  const collectionPath = useMemo(() => {
    if (!user) return null;
    const isAuthorized = user.uid === 'fKZUAAXTENPcUeEA4tUXFEV4xbr1' || user.uid === 'cbXyvN4G98Q7Y9IaJHhec0MyjlT2';
    return isAuthorized ? 'projects' : null;
  }, [user]);

  const projectsCollectionRef = useMemoFirebase(() => {
    return collectionPath ? collection(firestore, collectionPath) : null;
  }, [collectionPath, firestore]);

  const { data: projects, loading } = useCollection<Project>(projectsCollectionRef);

  const addProject = async (projectData: Omit<Project, 'id' | 'ownerId'>): Promise<string | null> => {
    if (!projectsCollectionRef || !user) return null;
    try {
      const docRef = await addDoc(projectsCollectionRef, { ...projectData, ownerId: user.uid });
      return docRef.id;
    } catch (serverError) {
      const permissionError = new FirestorePermissionError({
        path: projectsCollectionRef.path,
        operation: 'create',
        requestResourceData: projectData,
      });
      errorEmitter.emit('permission-error', permissionError);
      return null;
    }
  };

  const addActivity = (projectId: string, activityData: Omit<ProjectActivity, 'id'>) => {
    if (!firestore || !collectionPath) return;
    const activitiesCollectionRef = collection(firestore, `${collectionPath}/${projectId}/activities`);
    addDoc(activitiesCollectionRef, activityData).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: activitiesCollectionRef.path,
        operation: 'create',
        requestResourceData: activityData,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  };
  
  const updateActivity = async (projectId: string, activityId: string, updatedData: Partial<Omit<ProjectActivity, 'id'>>, newFiles: File[] = []) => {
    if (!firestore || !collectionPath) return;
    const docRef = doc(firestore, `${collectionPath}/${projectId}/activities`, activityId);

    let uploadedAttachments: Attachment[] = [];
    if (newFiles.length > 0) {
      try {
        const storage = getStorage();
        const uploadPromises = newFiles.map(async file => {
          const fileRef = storageRef(storage, `project_attachments/${projectId}/${activityId}/${Date.now()}_${file.name}`);
          const snapshot = await uploadBytes(fileRef, file);
          const downloadURL = await getDownloadURL(snapshot.ref);
          return { name: file.name, type: file.type, size: file.size, url: downloadURL };
        });
        uploadedAttachments = await Promise.all(uploadPromises);
      } catch (error) {
        console.error("Error uploading files:", error);
        toast({ variant: 'destructive', title: 'Error de carga', description: 'No se pudieron subir los archivos adjuntos.' });
        return; // Stop execution if upload fails
      }
    }
    
    const finalData = { ...updatedData };
    if (uploadedAttachments.length > 0) {
      finalData.attachments = [...(updatedData.attachments || []), ...uploadedAttachments];
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

  const deleteProject = (id: string) => {
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
  
  const importProjectFromCSV = async (projectName: string, activities: Omit<ProjectActivity, 'id'>[]) => {
    if (!firestore || !projectsCollectionRef || !user) return;
    
    try {
      // 1. Create project
      const projectDocRef = await addDoc(projectsCollectionRef, { name: projectName, ownerId: user.uid });
      const projectId = projectDocRef.id;

      // 2. Batch write activities
      const activitiesCollectionRef = collection(firestore, `projects/${projectId}/activities`);
      const batch = writeBatch(firestore);
      activities.forEach(activity => {
        const newActivityRef = doc(activitiesCollectionRef);
        batch.set(newActivityRef, activity);
      });
      await batch.commit();
      
      toast({ title: "Éxito", description: `Proyecto '${projectName}' y sus ${activities.length} actividades han sido importados.`});
    } catch(e) {
      console.error("Error importing project from CSV:", e);
      toast({ variant: "destructive", title: "Error de importación", description: "No se pudo importar el proyecto."});
       const permissionError = new FirestorePermissionError({
        path: projectsCollectionRef.path,
        operation: 'create',
        requestResourceData: { name: projectName },
      });
      errorEmitter.emit('permission-error', permissionError);
    }
  }

  const getActivitiesForProject = (projectId: string) => {
    const activitiesCollectionRef = useMemoFirebase(() => {
      if (!firestore || !collectionPath) return null;
      return collection(firestore, `${collectionPath}/${projectId}/activities`);
    }, [firestore, collectionPath, projectId]);

    const { data: activities, loading } = useCollection<ProjectActivity>(activitiesCollectionRef);
    return { activities: activities || [], loading };
  };

  const contextValue = {
    projects: projects || [],
    loading,
    addProject,
    addActivity,
    updateActivity,
    deleteProject,
    importProjectFromCSV,
    getActivitiesForProject,
  };

  return <ProjectsContext.Provider value={contextValue}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const context = useContext(ProjectsContext);
  if (context === undefined) {
    throw new Error('useProjects must be used within a ProjectsProvider');
  }
  return context;
}
