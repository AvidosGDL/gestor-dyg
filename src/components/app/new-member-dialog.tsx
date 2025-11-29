'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, ImageUp, RadioGroup } from 'lucide-react';
import { useAuth, useFirestore } from '@/firebase';
import { addDoc, collection } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { RadioGroup as RadioGroupUI, RadioGroupItem } from '@/components/ui/radio-group';


const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M21.35 11.1h-9.1v2.7h5.1c-.2 1.7-1.3 3.2-3.2 3.2-2.3 0-4.2-1.9-4.2-4.2s1.9-4.2 4.2-4.2c1.1 0 2 .4 2.7 1l2.1-2.1c-1.2-1.2-2.9-1.9-4.8-1.9-4.1 0-7.4 3.3-7.4 7.4s3.3 7.4 7.4 7.4c4.3 0 7.1-3 7.1-7.1 0-.6-.1-1.1-.2-1.6z"/>
  </svg>
);


const memberSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('El correo electrónico no es válido'),
  role: z.string().min(1, 'El rol es requerido'),
  phone: z.string().optional(),
  avatarUrl: z.string().url('Por favor, selecciona un avatar'),
  authType: z.enum(['google', 'email'], { required_error: 'Debes seleccionar un tipo de acceso.' }),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
})
.refine((data) => {
    if (data.authType === 'email') {
        return data.password && data.password.length >= 6;
    }
    return true;
    }, {
    message: 'La contraseña debe tener al menos 6 caracteres.',
    path: ['password'],
})
.refine((data) => {
    if (data.authType === 'email') {
        return data.password === data.confirmPassword;
    }
    return true;
    }, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
})
.refine((data) => {
    if(data.authType === 'google' && !data.email.endsWith('@gmail.com')){
        return false;
    }
    return true;
}, {
    message: 'El correo debe ser una cuenta de Gmail.',
    path: ['email'],
});

type MemberFormValues = z.infer<typeof memberSchema>;

const AVATAR_OPTIONS = 7;
const avatarCollection = 'lorelei';

const generateAvatarUrl = (seed: string) => `https://api.dicebear.com/8.x/${avatarCollection}/svg?seed=${seed}`;

interface NewMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any; // Accept user as a prop
}

export default function NewMemberDialog({
  open,
  onOpenChange,
  user,
}: NewMemberDialogProps) {
  const firestore = useFirestore();
  const auth = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customAvatarPreview, setCustomAvatarPreview] = useState<string | null>(null);
  
  const avatarOptions = React.useMemo(() => {
    return Array.from({ length: AVATAR_OPTIONS }, (_, i) => generateAvatarUrl(`avatar-${i}`));
  }, []);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
        authType: 'google',
        email: ''
    }
  });
  
  const selectedAvatarUrl = watch('avatarUrl');
  const authType = watch('authType');

  useEffect(() => {
    if (!open) {
      reset({ name: '', email: '', role: '', phone: '', avatarUrl: '', authType: 'google', password: '', confirmPassword: '' });
      setCustomAvatarPreview(null);
    }
  }, [open, reset]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setCustomAvatarPreview(dataUrl);
        setValue('avatarUrl', dataUrl, { shouldValidate: true });
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit: SubmitHandler<MemberFormValues> = async (data) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'No autenticado',
        description: 'Debes iniciar sesión para agregar miembros.',
      });
      return;
    }

    try {
        const finalData = { ...data };
        if (finalData.authType === 'google' && !finalData.email.endsWith('@gmail.com')) {
            finalData.email = `${finalData.email}@gmail.com`;
        }

        if (finalData.authType === 'email') {
            await createUserWithEmailAndPassword(auth, finalData.email, finalData.password!);
        }

        const collectionPath = `users/${user.uid}/teamMembers`;
        const { password, confirmPassword, ...memberData } = finalData;
        const newMember = { ...memberData };

        const membersCollection = collection(firestore, collectionPath);
        await addDoc(membersCollection, newMember);

        toast({
            title: 'Miembro Agregado',
            description: `${newMember.name} ha sido añadido al equipo y su cuenta ha sido creada.`,
        });
        onOpenChange(false);

    } catch (error: any) {
        if (error.code && error.code.startsWith('auth/')) {
             toast({
                variant: 'destructive',
                title: 'Error de Autenticación',
                description: error.message,
            });
        } else {
            const permissionError = new FirestorePermissionError({
                path: `users/${user.uid}/teamMembers`,
                operation: 'create',
                requestResourceData: data,
            });
            errorEmitter.emit('permission-error', permissionError);
        }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agregar Nuevo Miembro</DialogTitle>
          <DialogDescription>
            Rellena los detalles y crea las credenciales para el nuevo miembro.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Avatar</Label>
            <div className="grid grid-cols-4 gap-4">
                {avatarOptions.map((url, index) => (
                    <button
                        key={index}
                        type="button"
                        onClick={() => {
                          setValue('avatarUrl', url, { shouldValidate: true });
                          setCustomAvatarPreview(null);
                        }}
                        className={cn(
                            "rounded-full p-1 transition-all",
                            selectedAvatarUrl === url && !customAvatarPreview
                                ? 'ring-2 ring-primary ring-offset-2' 
                                : 'ring-1 ring-transparent hover:ring-primary/50'
                        )}
                    >
                        <Avatar className="h-16 w-16">
                            <AvatarImage src={url} alt={`Avatar ${index + 1}`} />
                        </Avatar>
                    </button>
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "rounded-full p-1 transition-all flex items-center justify-center bg-muted hover:bg-border",
                    customAvatarPreview && selectedAvatarUrl === customAvatarPreview
                      ? 'ring-2 ring-primary ring-offset-2'
                      : 'ring-1 ring-transparent hover:ring-primary/50'
                  )}
                >
                  <Avatar className="h-16 w-16">
                    {customAvatarPreview ? (
                      <AvatarImage src={customAvatarPreview} alt="Avatar personalizado" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageUp className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                  </Avatar>
                </button>
                <Input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/png, image/jpeg, image/gif"
                  onChange={handleFileChange}
                />
            </div>
            {errors.avatarUrl && (
              <p className="text-sm text-destructive">{errors.avatarUrl.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Nombre Completo</Label>
            <Input
              id="name"
              placeholder="Ej. Juan Pérez"
              {...register('name')}
              disabled={isSubmitting}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          
           <div className="space-y-2">
            <Label>Tipo de Acceso</Label>
            <RadioGroupUI 
                defaultValue="google" 
                className="flex gap-4" 
                onValueChange={(value) => setValue('authType', value as 'google' | 'email')}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="google" id="r1" />
                <Label htmlFor="r1">Acceso con Google</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="email" id="r2" />
                <Label htmlFor="r2">Correo y Contraseña</Label>
              </div>
            </RadioGroupUI>
             {errors.authType && (
              <p className="text-sm text-destructive">{errors.authType.message}</p>
            )}
          </div>

           {authType === 'google' && (
              <div className="space-y-2">
                <Label htmlFor="google-email">Correo Electrónico de Google</Label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <GoogleIcon/>
                  </div>
                  <Controller
                    name="email"
                    control={control}
                    render={({ field }) => (
                      <Input
                        id="google-email"
                        placeholder="usuario.de.google"
                        className="pl-10 pr-24"
                        {...field}
                      />
                    )}
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <span className="text-muted-foreground">@gmail.com</span>
                  </div>
                </div>
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>
            )}

            {authType === 'email' && (
              <>
                <div className="space-y-2">
                    <Label htmlFor="email">Correo Electrónico</Label>
                    <Input
                    id="email"
                    type="email"
                    placeholder="juan.perez@tuempresa.com"
                    {...register('email')}
                    disabled={isSubmitting}
                    />
                    {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <Input
                    id="password"
                    type="password"
                    {...register('password')}
                    disabled={isSubmitting}
                    />
                    {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
                    <Input
                    id="confirmPassword"
                    type="password"
                    {...register('confirmPassword')}
                    disabled={isSubmitting}
                    />
                    {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
                </div>
            </>
        )}

          <div className="space-y-2">
            <Label htmlFor="role">Rol</Label>
            <Input
              id="role"
              placeholder="Ej. Diseñador Gráfico"
              {...register('role')}
              disabled={isSubmitting}
            />
            {errors.role && (
              <p className="text-sm text-destructive">{errors.role.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              placeholder="Ej. +1 234 567 890"
              {...register('phone')}
              disabled={isSubmitting}
            />
            {errors.phone && (
              <p className="text-sm text-destructive">{errors.phone.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Agregar Miembro
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
