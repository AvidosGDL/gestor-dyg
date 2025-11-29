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
import { Textarea } from '@/components/ui/textarea';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2 } from 'lucide-react';
import { useProspects } from '@/contexts/prospects-context';
import { useToast } from '@/hooks/use-toast';

const prospectSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('Correo no válido').optional().or(z.literal('')),
  phone: z.string().optional(),
  businessDescription: z.string().min(1, 'La descripción es requerida'),
  nextContactDate: z.string().optional(),
});

type ProspectFormValues = z.infer<typeof prospectSchema>;

interface NewProspectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function NewProspectDialog({
  open,
  onOpenChange,
}: NewProspectDialogProps) {
  const { addProspect } = useProspects();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProspectFormValues>({
    resolver: zodResolver(prospectSchema),
  });
  
  useEffect(() => {
    if(!open) {
      reset({
        name: '',
        email: '',
        phone: '',
        businessDescription: '',
        nextContactDate: '',
      })
    }
  }, [open, reset]);

  const onSubmit: SubmitHandler<ProspectFormValues> = async (data) => {
    try {
      addProspect({
        ...data,
        contactLog: [],
      });
      toast({
        title: 'Prospecto Agregado',
        description: `${data.name} ha sido añadido a tu lista.`,
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al agregar prospecto',
        description: error.message || 'Ocurrió un error inesperado.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar Nuevo Prospecto</DialogTitle>
          <DialogDescription>
            Registra una nueva oportunidad de negocio.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del Prospecto</Label>
            <Input id="name" {...register('name')} disabled={isSubmitting} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input id="email" type="email" {...register('email')} disabled={isSubmitting} />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input id="phone" {...register('phone')} disabled={isSubmitting} />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="businessDescription">Descripción del Negocio</Label>
            <Textarea id="businessDescription" {...register('businessDescription')} disabled={isSubmitting} />
            {errors.businessDescription && <p className="text-sm text-destructive">{errors.businessDescription.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="nextContactDate">Fecha Próximo Contacto (Opcional)</Label>
            <Input id="nextContactDate" type="date" {...register('nextContactDate')} disabled={isSubmitting} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Agregar Prospecto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
