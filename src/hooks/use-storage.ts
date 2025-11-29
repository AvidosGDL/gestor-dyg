'use client';

import { useState } from 'react';
import { useUser, useStorage } from '@/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';

export function useStorage() {
  const storage = useStorage();
  const { user } = useUser();
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const uploadFiles = async (files: File[], basePath: string): Promise<string[]> => {
    if (!user) {
      throw new Error('User must be authenticated to upload files.');
    }

    setIsUploading(true);
    setProgress(0);
    setError(null);

    const uploadPromises = files.map(file => {
      const fileId = uuidv4();
      const fileExtension = file.name.split('.').pop();
      const filePath = `${basePath}/${fileId}.${fileExtension}`;
      const storageRef = ref(storage, filePath);
      const uploadTask = uploadBytesResumable(storageRef, file);

      return new Promise<string>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const currentProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            // This will update progress for the overall upload, not per file, for simplicity
            setProgress(currentProgress);
          },
          (error) => {
            console.error('Upload failed:', error);
            setError(error);
            reject(error);
          },
          () => {
            getDownloadURL(uploadTask.snapshot.ref).then(downloadURL => {
              resolve(downloadURL);
            });
          }
        );
      });
    });

    try {
      const urls = await Promise.all(uploadPromises);
      setIsUploading(false);
      return urls;
    } catch (e) {
      setIsUploading(false);
      if (e instanceof Error) {
        setError(e);
      }
      throw e;
    }
  };

  return { isUploading, progress, error, uploadFiles };
}
