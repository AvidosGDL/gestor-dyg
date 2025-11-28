'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';

function getErrorMessage(error: FirestorePermissionError): string {
  const { operation, path } = error.context;
  const user = error.user;

  let message = `Firestore operation '${operation}' on path '${path}' was denied.`;

  if (user) {
    message += ` User: ${user.email} (UID: ${user.uid}).`;
  } else {
    message += ` No user is signed in.`;
  }

  return message;
}

export function FirebaseErrorListener() {
  const { toast } = useToast();

  useEffect(() => {
    const handlePermissionError = (error: FirestorePermissionError) => {
      console.error('Firestore Permission Error:', error);
      toast({
        variant: 'destructive',
        title: 'Error de Permiso',
        description: getErrorMessage(error),
      });
    };

    errorEmitter.on('permission-error', handlePermissionError);

    return () => {
      errorEmitter.off('permission-error', handlePermissionError);
    };
  }, [toast]);

  return null;
}
