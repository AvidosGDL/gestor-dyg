'use client';

import React, { useEffect } from 'react';
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
import { Loader2 } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { addDoc, collection } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from '@/hooks/use-toast';

const memberSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('El correo electrónico no es válido'),
  role: z.string().min(1, 'El rol es requerido'),
  phone: z.string().optional(),
});

type MemberFormValues = z.infer<typeof memberSchema>;

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
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      name: '',
      email: '',
      role: '',
      phone: '',
    },
  });

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  const onSubmit: SubmitHandler<MemberFormValues> = (data) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'No autenticado',
        description: 'Debes iniciar sesión para agregar miembros.',
      });
      return;
    }

    const collectionPath = `users/${user.uid}/teamMembers`;
    const newMember = {
      ...data,
      avatarUrl: `https://i.pravatar.cc/150?u=${data.email}`,
    };

    const membersCollection = collection(firestore, collectionPath);
    addDoc(membersCollection, newMember).then(() => {
        toast({
            title: 'Miembro Agregado',
            description: `${newMember.name} ha sido añadido al equipo.`,
        });
        onOpenChange(false);
    }).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: collectionPath,
        operation: 'create',
        requestResourceData: newMember,
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar Nuevo Miembro</DialogTitle>
          <DialogDescription>
            Rellena los detalles del nuevo miembro del equipo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
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
