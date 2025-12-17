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
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, ImageUp } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { addDoc, collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const memberSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('El correo electrónico no es válido'),
  role: z.string().min(1, 'El rol es requerido'),
  phone: z.string().optional(),
  avatarUrl: z.string().url('Por favor, selecciona un avatar'),
  authType: z.enum(['google', 'email']).default('email'),
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
}: NewMemberDialogProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customAvatarFile, setCustomAvatarFile] = useState<string | null>(null);
  const [customAvatarPreview, setCustomAvatarPreview] = useState<string | null>(null);
  
  const avatarOptions = React.useMemo(() => {
    return Array.from({ length: AVATAR_OPTIONS }, (_, i) => generateAvatarUrl(`avatar-${i}`));
  }, []);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      name: '',
      email: '',
      role: '',
      phone: '',
      avatarUrl: '',
      authType: 'email',
    }
  });
  
  const selectedAvatarUrl = watch('avatarUrl');

  useEffect(() => {
    if (!open) {
      reset();
      setCustomAvatarPreview(null);
      setCustomAvatarFile(null);
    }
  }, [open, reset]);

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
      let finalAvatarUrl = data.avatarUrl;
      if (customAvatarFile) {
        finalAvatarUrl = await uploadAvatar(data.email, customAvatarFile);
      }
      
      const newMemberData = { 
        ...data, 
        avatarUrl: finalAvatarUrl,
        authType: data.email.endsWith('@gmail.com') ? 'google' : 'email',
      };

      // 1. Add to team members subcollection
      const teamMembersPath = `users/${user.uid}/teamMembers`;
      const membersCollection = collection(firestore, teamMembersPath);
      
      const memberDocPromise = addDoc(membersCollection, newMemberData).catch(async (serverError) => {
          const permissionError = new FirestorePermissionError({
            path: teamMembersPath,
            operation: 'create',
            requestResourceData: newMemberData,
          });
          errorEmitter.emit('permission-error', permissionError);
          throw serverError;
      });

      // 2. Add to global invitations collection
      const invitationPath = `invitations/${data.email}`;
      const invitationRef = doc(firestore, invitationPath);
      const invitationData = {
        email: data.email,
        inviterId: user.uid,
        inviterName: user.displayName || 'un administrador',
        createdAt: serverTimestamp(),
      };

      const invitationPromise = setDoc(invitationRef, invitationData, { merge: true }).catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
          path: invitationPath,
          operation: 'create',
          requestResourceData: invitationData,
        });
        errorEmitter.emit('permission-error', permissionError);
        throw serverError;
      });

      await Promise.all([memberDocPromise, invitationPromise]);

      toast({
        title: 'Miembro Invitado',
        description: `${data.name} ha sido añadido al equipo e invitado al sistema.`,
      });
      onOpenChange(false);

    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al agregar miembro',
        description: error.message || 'Ocurrió un error inesperado al invitar o agregar al miembro.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agregar Nuevo Miembro del Equipo</DialogTitle>
          <DialogDescription>
            Añade los detalles del nuevo miembro. Se le enviará una invitación para unirse al sistema.
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
                          setCustomAvatarFile(null);
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
                    customAvatarPreview
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
            <Label htmlFor="phone">Teléfono (Opcional)</Label>
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
