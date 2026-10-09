
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
import { Loader2, UserPlus, Mail, Briefcase, Lock, Copy, Check, Eye, EyeOff } from 'lucide-react';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { copyToClipboard } from '@/lib/copy-to-clipboard';

const memberSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('El correo electrónico no es válido'),
  role: z.string().min(1, 'El rol o cargo es requerido'),
  password: z
    .string()
    .optional()
    .refine((v) => !v || v.trim().length === 0 || v.trim().length >= 6, 'La contraseña debe tener al menos 6 caracteres'),
});

interface RegisterResult {
  success: boolean;
  uid: string;
  resetLink?: string | null;
  emailSent?: boolean;
  warning?: string;
}

interface GeneratedLinkInfo {
  name: string;
  link: string;
  emailSent: boolean;
  hadPassword: boolean;
}

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
  const [generated, setGenerated] = useState<GeneratedLinkInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      password: '',
    },
  });

  useEffect(() => {
    if (!open) {
      reset();
      setGenerated(null);
      setCopied(false);
      setShowPassword(false);
    }
  }, [open, reset]);

  const handleCopy = async () => {
    if (!generated) return;
    const ok = await copyToClipboard(generated.link);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else {
      toast({ variant: 'destructive', title: 'No se pudo copiar', description: 'Selecciona la liga y cópiala manualmente.' });
    }
  };

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

      const password = data.password?.trim() || '';
      const response = await registerFunction({
        email: data.email,
        name: data.name,
        role: data.role,
        inviterId: user.uid,
        inviterName: user.displayName || 'Un Administrador',
        password: password || null,
      });

      const result = response.data as RegisterResult;

      if (result.warning) {
        toast({ title: 'Miembro registrado con advertencia', description: result.warning });
      } else {
        toast({
          title: 'Miembro Registrado',
          description: password
            ? `Se ha creado la cuenta para ${data.name} con la contraseña asignada.`
            : `Se ha creado la cuenta para ${data.name}. Se envió una liga a su correo para que defina su contraseña.`,
        });
      }

      if (result.resetLink) {
        // Se muestra la liga al administrador (se genera bajo demanda; no se guarda).
        setGenerated({
          name: data.name,
          link: result.resetLink,
          emailSent: !!result.emailSent,
          hadPassword: !!password,
        });
      } else {
        onOpenChange(false);
      }
    } catch (error: any) {
      console.error('Error registering member:', error?.code, error?.message);
      let description = error?.message || 'Ocurrió un error inesperado al procesar el registro.';
      if (error?.code === 'functions/internal' && error?.message === 'internal') {
        description = 'No se pudo contactar el servicio de alta de miembros. Verifica que la función "registerTeamMember" esté desplegada e inténtalo de nuevo.';
      } else if (error?.code === 'functions/not-found') {
        description = 'La función de alta de miembros no está disponible en el servidor.';
      }
      toast({
        variant: 'destructive',
        title: 'Error al dar de alta',
        description,
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
        {generated ? (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase text-green-600">Liga de acceso generada</p>
              <p className="text-sm font-medium">Liga para definir contraseña de: {generated.name}</p>
              <p className="text-xs text-muted-foreground">
                {generated.emailSent && !generated.hadPassword
                  ? 'También se envió por correo. '
                  : ''}
                Comparte esta liga con el usuario para que defina su contraseña e inicie sesión.
              </p>
              <div className="flex gap-2">
                <Input readOnly value={generated.link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" id="member-reset-link" />
                <Button type="button" onClick={handleCopy} className="shrink-0 gap-2">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copiada' : 'Copiar Liga'}
                </Button>
              </div>
            </div>
            <DialogFooter className="pt-4 border-t">
              <Button type="button" onClick={() => onOpenChange(false)}>Cerrar</Button>
            </DialogFooter>
          </div>
        ) : (
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

          <div className="space-y-2">
            <Label htmlFor="member-password">Contraseña (Opcional)</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="member-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                className="pl-9 pr-10"
                placeholder="Vacío para definir mediante liga"
                {...register('password')}
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>

          <div className="p-3 bg-muted/50 rounded-lg border border-dashed border-primary/20">
             <p className="text-[10px] text-muted-foreground font-bold uppercase">Seguridad</p>
             <p className="text-xs text-foreground mt-1">
                Si dejas la contraseña <strong>vacía</strong>, el usuario la definirá mediante la liga de bienvenida. En ambos casos se genera una liga que podrás copiar.
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
        )}
      </DialogContent>
    </Dialog>
  );
}
