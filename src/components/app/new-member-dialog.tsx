'use client';

import React, { useEffect, useState } from 'react';
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
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';

const memberSchema = z.object({
  email: z.string().email('El correo electrónico no es válido'),
});

type InvitationFormValues = z.infer<typeof memberSchema>;

interface NewMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
}

export default function NewMemberDialog({
  open,
  onOpenChange,
}: NewMemberDialogProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvitationFormValues>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      email: '',
    },
  });

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  const onSubmit: SubmitHandler<InvitationFormValues> = async (data) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'No autenticado',
        description: 'Debes iniciar sesión para invitar a miembros.',
      });
      return;
    }

    try {
      // 1. Create invitation document in Firestore
      const invitationRef = doc(firestore, 'invitations', data.email);
      await setDoc(invitationRef, {
        email: data.email,
        inviterId: user.uid,
        inviterName: user.displayName || 'un administrador',
        createdAt: serverTimestamp(),
      });
      
      // 2. Call the Cloud Function to send the email
      const functions = getFunctions();
      const sendInvitationEmail = httpsCallable(functions, 'sendInvitationEmail');
      
      // Use the current window origin to build the registration URL
      const registrationUrl = `${window.location.origin}/login`;

      await sendInvitationEmail({
        email: data.email,
        inviterName: user.displayName || 'Un colega',
        registrationUrl: registrationUrl, // Pass the dynamic URL
      });

      toast({
        title: 'Invitación Enviada',
        description: `Se ha enviado una invitación por correo electrónico a ${data.email}.`,
      });
      onOpenChange(false);

    } catch (error: any) {
      console.error("Error sending invitation:", error);
      toast({
        variant: 'destructive',
        title: 'Error al enviar la invitación',
        description: error.message || 'Ocurrió un error inesperado.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar Nuevo Miembro al Equipo</DialogTitle>
          <DialogDescription>
            Ingresa el correo electrónico de la persona que quieres invitar. Recibirá un email con un enlace para registrarse y unirse a tu equipo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo Electrónico del Invitado</Label>
            <Input
              id="email"
              type="email"
              placeholder="nuevo.miembro@tuempresa.com"
              {...register('email')}
              disabled={isSubmitting}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
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
              Enviar Invitación
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
