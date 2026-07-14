'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
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
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, ImageUp, Lock } from 'lucide-react';
import { useFirestore, useUser, useAuth } from '@/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { UserProfile } from '@/lib/types';
import { Alert, AlertDescription } from '../ui/alert';

const profileSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email(),
  role: z.string().min(1, 'El rol es requerido'),
  phone: z.string().optional(),
  avatarUrl: z.string().url('Por favor, selecciona un avatar'),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const AVATAR_OPTIONS = 7;
const avatarCollection = 'lorelei';
const generateAvatarUrl = (seed: string) => `https://api.dicebear.com/8.x/${avatarCollection}/svg?seed=${seed}`;

interface EditProfileDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function EditProfileDialog({ isOpen, onOpenChange }: EditProfileDialogProps) {
  const { user } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customAvatarFile, setCustomAvatarFile] = useState<string | null>(null);
  const [customAvatarPreview, setCustomAvatarPreview] = useState<string | null>(null);

  const isAdmin = user?.uid === 'fKZUAAXTENPcUeEA4tUXFEV4xbr1';

  const avatarOptions = useMemo(() => {
    return Array.from({ length: AVATAR_OPTIONS }, (_, i) => generateAvatarUrl(`avatar-${i}`));
  }, []);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
  });

  const selectedAvatarUrl = watch('avatarUrl');

  useEffect(() => {
    if (user && isOpen) {
      const fetchProfile = async () => {
        const userDocRef = doc(firestore, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const profileData = userDocSnap.data() as UserProfile;
          reset(profileData);
          if (!avatarOptions.includes(profileData.avatarUrl)) {
            setCustomAvatarPreview(profileData.avatarUrl);
          } else {
            setCustomAvatarPreview(null);
          }
          setCustomAvatarFile(null);
        }
      };
      fetchProfile();
    }
  }, [user, isOpen, reset, firestore, avatarOptions]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) return;
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

  const uploadAvatar = async (userId: string, dataUrl: string): Promise<string> => {
    const storage = getStorage();
    const avatarRef = storageRef(storage, `avatars/${userId}/${Date.now()}`);
    await uploadString(avatarRef, dataUrl, 'data_url');
    return getDownloadURL(avatarRef);
  }

  const onSubmit: SubmitHandler<ProfileFormValues> = async (formData) => {
    if (!user || !isAdmin) return;
    
    let finalAvatarUrl = formData.avatarUrl;

    try {
       if (customAvatarFile) {
        finalAvatarUrl = await uploadAvatar(user.uid, customAvatarFile);
      }

      const dataToSave: Partial<ProfileFormValues> = {
        ...formData,
        avatarUrl: finalAvatarUrl,
      };

      const userDocRef = doc(firestore, 'users', user.uid);
      await updateDoc(userDocRef, dataToSave).catch(serverError => {
        const permissionError = new FirestorePermissionError({
           path: `users/${user.uid}`,
           operation: 'update',
           requestResourceData: dataToSave,
       });
       errorEmitter.emit('permission-error', permissionError);
       throw serverError;
      });
      
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
            displayName: dataToSave.name,
            photoURL: dataToSave.avatarUrl,
        });
      }

      toast({
        title: 'Perfil Actualizado',
        description: 'Tu información ha sido guardada correctamente.',
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al actualizar perfil',
        description: error.message || 'Ocurrió un error inesperado.',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Perfil de Usuario</DialogTitle>
          <DialogDescription>
            Información de tu cuenta en Gestor D&G.
          </DialogDescription>
        </DialogHeader>

        {!isAdmin && (
            <Alert className="bg-muted border-none">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <AlertDescription className="text-xs text-muted-foreground">
                    Solo el superadministrador puede editar los datos de perfil (nombre, correo, avatar y teléfono). Por favor contacta a soporte si necesitas actualizar tu información.
                </AlertDescription>
            </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Avatar</Label>
            <div className="grid grid-cols-4 gap-4">
                {avatarOptions.map((url, index) => (
                    <button
                        key={index}
                        type="button"
                        disabled={!isAdmin}
                        onClick={() => {
                          setValue('avatarUrl', url, { shouldValidate: true });
                          setCustomAvatarPreview(null);
                          setCustomAvatarFile(null);
                        }}
                        className={cn(
                            "rounded-full p-1 transition-all",
                            selectedAvatarUrl === url && !customAvatarPreview
                                ? 'ring-2 ring-primary ring-offset-2' 
                                : 'ring-1 ring-transparent hover:ring-primary/50',
                            !isAdmin && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        <Avatar className="h-16 w-16">
                            <AvatarImage src={url} alt={`Avatar ${index + 1}`} />
                        </Avatar>
                    </button>
                ))}
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "rounded-full p-1 transition-all flex items-center justify-center bg-muted hover:bg-border",
                    customAvatarPreview
                      ? 'ring-2 ring-primary ring-offset-2'
                      : 'ring-1 ring-transparent hover:ring-primary/50',
                    !isAdmin && "opacity-50 cursor-not-allowed"
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
              {...register('name')}
              disabled={isSubmitting || !isAdmin}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="email">Correo Electrónico</Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              disabled
              className="disabled:opacity-100 disabled:cursor-not-allowed bg-muted/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Rol o Cargo</Label>
            <Input
              id="role"
              {...register('role')}
              disabled={isSubmitting || !isAdmin}
            />
            {errors.role && (
              <p className="text-sm text-destructive">{errors.role.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              {...register('phone')}
              disabled={isSubmitting || !isAdmin}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cerrar
            </Button>
            {isAdmin && (
                <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar Cambios
                </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
