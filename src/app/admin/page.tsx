'use client';

import { useUser, useAuth } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { signOut } from 'firebase/auth';
import { FirebaseClientProvider } from '@/firebase/client-provider';

const ADMIN_UIDS = ['fKZUAAXTENPcUeEA4tUXFEV4xbr1'];

function Admin() {
  const { user, loading } = useUser();
  const router = useRouter();
  const auth = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Cargando...
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isAuthorized = ADMIN_UIDS.includes(user.uid);

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <h1 className="text-2xl font-bold mb-4">Acceso Denegado</h1>
        <p className="mb-4">No tienes permiso para ver esta página.</p>
        <Button onClick={() => signOut(auth)}>Cerrar Sesión</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Página de Administrador</h1>
        <Button onClick={() => signOut(auth)}>Cerrar Sesión</Button>
      </div>
      <p>¡Bienvenido, {user.email}!</p>
      {/* Admin content goes here */}
    </div>
  );
}

export default function AdminPage() {
  return (
    <FirebaseClientProvider>
      <Admin />
    </FirebaseClientProvider>
  );
}
