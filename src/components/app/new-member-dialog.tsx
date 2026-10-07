
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
import { Loader2, UserPlus, Mail, Briefcase } from 'lucide-react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';

const memberSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('El correo electrónico no es válido'),
  role: z.string().min(1, 'El rol o cargo es requerido'),
});

type MemberFormValues = z.infer<typeof memberSchema>;

interface NewMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function NewMemberDialog({
  open,
  onOpenChange,
}: NewMemberDialogProps) {
  const { user } = useUser();
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
    },
  });

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  const onSubmit: SubmitHandler<MemberFormValues> = async (data) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'No autenticado',
        description: 'Debes iniciar sesión para registrar miembros.',
      });
      return;
    }

    try {
      const functions = getFunctions();
      const registerFunction = httpsCallable(functions, 'registerTeamMember');

      await registerFunction({
        email: data.email,
        name: data.name,
        role: data.role,
        inviterId: user.uid,
        inviterName: user.displayName || 'Un Administrador',
      });

      toast({
        title: 'Miembro Registrado',
        description: `Se ha creado la cuenta para ${data.name}. Se ha enviado una liga a su correo para que defina su contraseña.`,
      });
      
      console.log(`[Terminal] Alta exitosa: ${data.email} registrado. Contraseña en blanco asignada. Liga de definición enviada.`);
      
      onOpenChange(false);

    } catch (error: any) {
      console.error("Error registering member:", error);
      toast({
        variant: 'destructive',
        title: 'Error al dar de alta',
        description: error.message || 'Ocurrió un error inesperado al procesar el registro.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Dar de Alta Nuevo Miembro
          </DialogTitle>
          <DialogDescription>
            Registra los datos del nuevo integrante. El sistema creará su cuenta y le enviará un correo para que establezca su contraseña personal.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="member-name">Nombre Completo</Label>
            <Input
              id="member-name"
              placeholder="Ej. Juan Pérez"
              {...register('name')}
              disabled={isSubmitting}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-email">Correo Electrónico</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="member-email"
                type="email"
                className="pl-9"
                placeholder="nuevo.miembro@tuempresa.com"
                {...register('email')}
                disabled={isSubmitting}
              />
            </div>
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-role">Rol o Cargo</Label>
            <div className="relative">
              <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="member-role"
                className="pl-9"
                placeholder="Ej. Contador, Administrador..."
                {...register('role')}
                disabled={isSubmitting}
              />
            </div>
            {errors.role && <p className="text-sm text-destructive">{errors.role.message}</p>}
          </div>

          <div className="p-3 bg-muted/50 rounded-lg border border-dashed border-primary/20">
             <p className="text-[10px] text-muted-foreground font-bold uppercase">Seguridad</p>
             <p className="text-xs text-foreground mt-1">
                La contraseña se mantendrá <strong>vacía</strong> hasta que el usuario la defina mediante la liga de bienvenida.
             </p>
          </div>

          <DialogFooter className="pt-4 border-t">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando...</>
              ) : (
                'Registrar y Enviar Liga'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
