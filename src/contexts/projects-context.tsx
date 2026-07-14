
'use client';

import React, { createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import type { Project, ProjectActivity, Attachment, UserProfile } from '@/lib/types';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  getDoc,
} from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';

interface ProjectsContextType {
  projects: Project[];
  addProject: (projectData: Omit<Project, 'id' | 'ownerId'>) => Promise<string | null>;
  updateProject: (projectId: string, updatedData: Partial<Omit<Project, 'id' | 'ownerId'>>) => Promise<void>;
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
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    async function fetchProfile() {
        if (user && firestore) {
            const snap = await getDoc(doc(firestore, 'users', user.uid));
            if (snap.exists()) setUserProfile(snap.data() as UserProfile);
        }
    }
    fetchProfile();
  }, [user, firestore]);

  const collectionPath = useMemo(() => {
    if (!user || !userProfile) return null;
    const isAuthorized = user.uid === 'fKZUAAXTENPcUeEA4tUXFEV4xbr1' || !!userProfile.canAccessProjects;
    return isAuthorized ? 'projects' : null;
  }, [user, userProfile]);

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
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: projectsCollectionRef.path, operation: 'create', requestResourceData: projectData }));
      return null;
    }
  };

  const updateProject = async (projectId: string, updatedData: Partial<Omit<Project, 'id' | 'ownerId'>>) => {
    if (!firestore || !collectionPath) return;
    const docRef = doc(firestore, collectionPath, projectId);
    try {
      await updateDoc(docRef, updatedData);
    } catch (serverError) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'update', requestResourceData: updatedData }));
      throw serverError;
    }
  };

  const addActivity = (projectId: string, activityData: Omit<ProjectActivity, 'id'>) => {
    if (!firestore || !collectionPath) return;
    const activitiesCollectionRef = collection(firestore, `${collectionPath}/${projectId}/activities`);
    addDoc(activitiesCollectionRef, activityData).catch(async (serverError) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: activitiesCollectionRef.path, operation: 'create', requestResourceData: activityData }));
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
          return { name: file.name, type: file.type, size: file.size, url: await getDownloadURL(snapshot.ref) };
        });
        uploadedAttachments = await Promise.all(uploadPromises);
      } catch (error) {
        toast({ variant: 'destructive', title: 'Error de carga' });
        return;
      }
    }
    const finalData = { ...updatedData };
    if (uploadedAttachments.length > 0) finalData.attachments = [...(updatedData.attachments || []), ...uploadedAttachments];
    updateDoc(docRef, finalData).catch(async (serverError) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'update', requestResourceData: finalData }));
    });
  };

  const deleteProject = (id: string) => {
    if (!firestore || !collectionPath) return;
    const docRef = doc(firestore, collectionPath, id);
    deleteDoc(docRef).catch(async (serverError) => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: docRef.path, operation: 'delete' }));
    });
  };
  
  const importProjectFromCSV = async (projectName: string, activities: Omit<ProjectActivity, 'id'>[]) => {
    if (!firestore || !projectsCollectionRef || !user) return;
    try {
      const projectDocRef = await addDoc(projectsCollectionRef, { name: projectName, ownerId: user.uid });
      const activitiesCollectionRef = collection(firestore, `projects/${projectDocRef.id}/activities`);
      const batch = writeBatch(firestore);
      activities.forEach(activity => batch.set(doc(activitiesCollectionRef), activity));
      await batch.commit();
      toast({ title: "Éxito" });
    } catch(e) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({ path: projectsCollectionRef.path, operation: 'create', requestResourceData: { name: projectName } }));
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

  const contextValue = { projects: projects || [], loading, addProject, updateProject, addActivity, updateActivity, deleteProject, importProjectFromCSV, getActivitiesForProject };
  return <ProjectsContext.Provider value={contextValue}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const context = useContext(ProjectsContext);
  if (context === undefined) throw new Error('useProjects must be used within a ProjectsProvider');
  return context;
}
