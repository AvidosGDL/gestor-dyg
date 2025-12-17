'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { useAuth, useFirestore } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { doc, setDoc, getDoc, deleteDoc, query, collection, where, getDocs, writeBatch } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { cn } from '@/lib/utils';
import { Avatar, AvatarImage } from '@/components/ui/avatar';
import { ImageUp, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import * as z from 'zod';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { type UserProfile } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';


const AVATAR_OPTIONS = 7;
const avatarCollection = 'lorelei';
const generateAvatarUrl = (seed: string) => `https://api.dicebear.com/8.x/${avatarCollection}/svg?seed=${seed}`;

const loginSchema = z.object({
  email: z.string().email('El correo electrónico no es válido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

const signupSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('El correo electrónico no es válido'),
  role: z.string().min(1, 'El rol es requerido'),
  phone: z.string().optional(),
  avatarUrl: z.string().url('Por favor, selecciona un avatar'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden.',
  path: ['confirmPassword'],
});

type LoginValues = z.infer<typeof loginSchema>;
type SignupValues = z.infer<typeof signupSchema>;

const createProfileAndLinkTasks = async (user: User, firestore: any, signupData?: SignupValues) => {
  const userDocRef = doc(firestore, 'users', user.uid);
  const userDocSnap = await getDoc(userDocRef);

  // Create profile if it doesn't exist
  if (!userDocSnap.exists()) {
      const userProfile: UserProfile = {
          name: signupData?.name || user.displayName || 'Usuario Anónimo',
          email: signupData?.email || user.email || '',
          avatarUrl: signupData?.avatarUrl || user.photoURL || generateAvatarUrl(user.uid),
          role: signupData?.role || 'Miembro',
          phone: signupData?.phone || '',
      };
      await setDoc(userDocRef, userProfile).catch(serverError => {
        const permissionError = new FirestorePermissionError({
           path: `users/${user.uid}`,
           operation: 'create',
           requestResourceData: userProfile,
       });
       errorEmitter.emit('permission-error', permissionError);
      });
  }
  
  // Link pending tasks for this email
  const tasksToUpdateQuery = query(
    collection(firestore, 'tasks'),
    where('delegateToEmail', '==', user.email),
    where('delegateToId', '==', null)
  );

  const tasksSnapshot = await getDocs(tasksToUpdateQuery);
  if (!tasksSnapshot.empty) {
      const batch = writeBatch(firestore);
      tasksSnapshot.forEach(taskDoc => {
          const taskRef = doc(firestore, 'tasks', taskDoc.id);
          batch.update(taskRef, { delegateToId: user.uid });
      });
      await batch.commit();
  }
};
  
function LoginForm() {
    const auth = useAuth();
    const { toast } = useToast();
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({
      resolver: zodResolver(loginSchema)
    });
  
    const onLogin: SubmitHandler<LoginValues> = async (data) => {
      try {
        await signInWithEmailAndPassword(auth, data.email, data.password);
        toast({ title: 'Éxito', description: `Has iniciado sesión.` });
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Error de Autenticación',
          description: error.message,
        });
      }
    };

    return (
      <form onSubmit={handleSubmit(onLogin)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-email">Correo Electrónico</Label>
          <Input id="login-email" type="email" placeholder="tu@email.com" {...register('email')} disabled={isSubmitting} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="login-password">Contraseña</Label>
          <Input id="login-password" type="password" {...register('password')} disabled={isSubmitting} />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Iniciando...' : 'Iniciar Sesión'}
        </Button>
      </form>
    );
  }


function SignupForm() {
    const auth = useAuth();
    const firestore = useFirestore();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [customAvatarFile, setCustomAvatarFile] = useState<string | null>(null);
    const [customAvatarPreview, setCustomAvatarPreview] = useState<string | null>(null);
  
    const avatarOptions = useMemo(() => {
      return Array.from({ length: AVATAR_OPTIONS }, (_, i) => generateAvatarUrl(`avatar-${i}`));
    }, []);
  
    const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<SignupValues>({
      resolver: zodResolver(signupSchema)
    });
  
    const selectedAvatarUrl = watch('avatarUrl');
  
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          setCustomAvatarFile(dataUrl);
          setCustomAvatarPreview(dataUrl);
          setValue('avatarUrl', dataUrl, { shouldValidate: true });
        };
        reader.readAsDataURL(file);
      }
    };

    const uploadAvatar = async (email: string, dataUrl: string): Promise<string> => {
      const storage = getStorage();
      const avatarRef = storageRef(storage, `avatars/${email}/${Date.now()}`);
      await uploadString(avatarRef, dataUrl, 'data_url');
      return getDownloadURL(avatarRef);
    }
  
    const onSignup: SubmitHandler<SignupValues> = async (data) => {
      try {
        // 1. Check for invitation
        const invitationRef = doc(firestore, 'invitations', data.email);
        const invitationSnap = await getDoc(invitationRef);

        if (!invitationSnap.exists()) {
          toast({
            variant: 'destructive',
            title: 'Acceso Denegado',
            description: 'Se necesita una invitación para ingresar al sistema.',
          });
          return;
        }
        
        let finalAvatarUrl = data.avatarUrl;
        if (customAvatarFile) {
          finalAvatarUrl = await uploadAvatar(data.email, customAvatarFile);
        }

        // 2. Create user in Auth
        const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
        const user = userCredential.user;
        
        await updateProfile(user, {
            displayName: data.name,
            photoURL: finalAvatarUrl,
        });

        // 3. Create profile in 'users' and link pending tasks
        await createProfileAndLinkTasks(user, firestore, {...data, avatarUrl: finalAvatarUrl});

        // 4. Delete invitation
        await deleteDoc(invitationRef);

        toast({ title: 'Éxito', description: 'Tu cuenta ha sido creada.' });
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Error de Registro',
          description: error.message,
        });
      }
    };
  
    return (
      <form onSubmit={handleSubmit(onSignup)} className="space-y-4">
        <div className="space-y-2">
            <Label>Avatar</Label>
            <div className="grid grid-cols-4 gap-2">
                {avatarOptions.map((url, index) => (
                    <button key={index} type="button" onClick={() => { setValue('avatarUrl', url, { shouldValidate: true }); setCustomAvatarPreview(null); setCustomAvatarFile(null); }} className={cn("rounded-full p-1 transition-all", selectedAvatarUrl === url && !customAvatarPreview ? 'ring-2 ring-primary ring-offset-2' : 'ring-1 ring-transparent hover:ring-primary/50')}>
                        <Avatar className="h-12 w-12"><AvatarImage src={url} alt={`Avatar ${index + 1}`} /></Avatar>
                    </button>
                ))}
                <button type="button" onClick={() => fileInputRef.current?.click()} className={cn("rounded-full p-1 transition-all flex items-center justify-center bg-muted hover:bg-border", customAvatarPreview ? 'ring-2 ring-primary ring-offset-2' : 'ring-1 ring-transparent hover:ring-primary/50')}>
                  <Avatar className="h-12 w-12">{customAvatarPreview ? <AvatarImage src={customAvatarPreview} alt="Avatar personalizado" /> : <div className="w-full h-full flex items-center justify-center"><ImageUp className="w-6 h-6 text-muted-foreground" /></div>}</Avatar>
                </button>
                <Input type="file" ref={fileInputRef} className="hidden" accept="image/png, image/jpeg, image/gif" onChange={handleFileChange} />
            </div>
            {errors.avatarUrl && <p className="text-sm text-destructive">{errors.avatarUrl.message}</p>}
        </div>

        <div className="space-y-2">
            <Label htmlFor="signup-name">Nombre Completo</Label>
            <Input id="signup-name" placeholder="Ej. Juan Pérez" {...register('name')} disabled={isSubmitting} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-2">
            <Label htmlFor="signup-email">Correo Electrónico</Label>
            <Input id="signup-email" type="email" placeholder="tu@email.com" {...register('email')} disabled={isSubmitting} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-2">
            <Label htmlFor="signup-role">Rol o Cargo</Label>
            <Input id="signup-role" placeholder="Ej. Diseñador" {...register('role')} disabled={isSubmitting} />
            {errors.role && <p className="text-sm text-destructive">{errors.role.message}</p>}
        </div>

        <div className="space-y-2">
            <Label htmlFor="signup-phone">Teléfono (Opcional)</Label>
            <Input id="signup-phone" placeholder="Ej. +1 234 567 890" {...register('phone')} disabled={isSubmitting} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="signup-password">Contraseña</Label>
          <Input id="signup-password" type="password" {...register('password')} disabled={isSubmitting} />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="signup-confirmPassword">Confirmar Contraseña</Label>
          <Input id="signup-confirmPassword" type="password" {...register('confirmPassword')} disabled={isSubmitting} />
          {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
        </div>
  
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Creando cuenta...</> : 'Crear Cuenta'}
        </Button>
      </form>
    );
  }

function AuthPage() {
  const router = useRouter();
  const auth = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
            setUser(user);
            router.push('/');
        } else {
            setUser(null);
        }
        setIsLoading(false);
    });

    return () => unsubscribe();
  }, [auth, router]);

  if (isLoading || user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
         <Loader2 className="h-5 w-5 animate-spin"/> Cargando...
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
            <Image 
                src="https://firebasestorage.googleapis.com/v0/b/studio-8033020115-912ac.firebasestorage.app/o/public%2Flogo%20DyG.jpeg?alt=media&token=578d1bd8-b8a4-47b6-a97f-e7731dc39bf1" 
                alt="Gestor D&G Logo"
                width={80}
                height={80}
                className="mx-auto mb-4 rounded-lg"
            />
          <CardTitle>Gestor D&G</CardTitle>
          <CardDescription>Accede a tu panel o crea una cuenta nueva.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Iniciar Sesión</TabsTrigger>
              <TabsTrigger value="signup">Registrarse</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="pt-4">
              <LoginForm />
            </TabsContent>
            <TabsContent value="signup" className="pt-4">
              <SignupForm />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
    return <AuthPage />;
}

    
