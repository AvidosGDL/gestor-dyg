'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { useUser, useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  useEffect(() => {
    if (!isUserLoading && user) {
      router.push('/');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading || user) {
    return <div className="flex items-center justify-center min-h-screen bg-background">Cargando...</div>;
  }

  const handleAuth = async (e: React.FormEvent, action: 'signIn' | 'signUp') => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (action === 'signIn') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      toast({ title: 'Éxito', description: `Has ${action === 'signIn' ? 'iniciado sesión' : 'creado una cuenta'}.` });
      // The useEffect will handle the redirection
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error de Autenticación',
        description: error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    setIsSubmitting(true);
    try {
      await signInWithPopup(auth, provider);
      toast({ title: 'Éxito', description: 'Has iniciado sesión con Google.' });
      // The useEffect will handle the redirection
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error de Autenticación con Google',
        description: error.message,
      });
    } finally {
        setIsSubmitting(false);
    }
  };


  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Iniciar Sesión</CardTitle>
          <CardDescription>Accede a tu panel de administración.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo Electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
               <Button onClick={(e) => handleAuth(e, 'signIn')} disabled={isSubmitting} className="w-full">
                {isSubmitting ? 'Iniciando...' : 'Iniciar Sesión'}
              </Button>
              <Button onClick={(e) => handleAuth(e, 'signUp')} variant="outline" disabled={isSubmitting} className="w-full">
                Registrarse
              </Button>
            </div>
          </form>
           <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  O continuar con
                </span>
              </div>
            </div>
            <Button onClick={handleGoogleSignIn} variant="outline" className="w-full" disabled={isSubmitting}>
              Iniciar sesión con Google
            </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
    return (
      <Login />
    )
}
