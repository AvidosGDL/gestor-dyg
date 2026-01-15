
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
import { DollarSign, Loader2, Percent } from 'lucide-react';
import { useInvestors } from '@/contexts/investors-context';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';

const investorSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('Correo no válido').optional().or(z.literal('')),
  phone: z.string().optional(),
  investmentDate: z.string().min(1, 'La fecha es requerida'),
  investmentAmount: z.coerce.number().min(1, 'El monto debe ser mayor a 0'),
  interestRate: z.coerce.number().min(0, 'La tasa no puede ser negativa'),
  paymentMethod: z.string().min(1, 'El método de pago es requerido'),
  status: z.enum(['Activa', 'Liquidada']),
});

type InvestorFormValues = z.infer<typeof investorSchema>;

const defaultValues: InvestorFormValues = {
    name: '',
    email: '',
    phone: '',
    investmentDate: new Date().toISOString().split('T')[0],
    investmentAmount: 0,
    interestRate: 0,
    paymentMethod: 'Transferencia',
    status: 'Activa',
};

interface NewInvestorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function NewInvestorDialog({
  open,
  onOpenChange,
}: NewInvestorDialogProps) {
  const { addInvestor } = useInvestors();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<InvestorFormValues>({
    resolver: zodResolver(investorSchema),
    defaultValues,
  });
  
  useEffect(() => {
    if(!open) {
      reset(defaultValues)
    }
  }, [open, reset]);

  const onSubmit: SubmitHandler<InvestorFormValues> = async (data) => {
    try {
      addInvestor({
        ...data,
        transactions: [],
      });
      toast({
        title: 'Inversionista Agregado',
        description: `${data.name} ha sido añadido a tu lista.`,
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al agregar inversionista',
        description: error.message || 'Ocurrió un error inesperado.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar Nuevo Inversionista</DialogTitle>
          <DialogDescription>
            Registra un nuevo ingreso de capital.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del Inversionista</Label>
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
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="investmentDate">Fecha de Inversión</Label>
              <Input id="investmentDate" type="date" {...register('investmentDate')} disabled={isSubmitting} />
               {errors.investmentDate && <p className="text-sm text-destructive">{errors.investmentDate.message}</p>}
            </div>
             <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select onValueChange={(value) => control.setValue('status', value as 'Activa' | 'Liquidada')} defaultValue={defaultValues.status}>
                  <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                      <SelectItem value="Activa">Activa</SelectItem>
                      <SelectItem value="Liquidada">Liquidada</SelectItem>
                  </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="investmentAmount">Monto Invertido ($)</Label>
              <div className="relative">
                <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input id="investmentAmount" type="number" className="pl-9" {...register('investmentAmount')} disabled={isSubmitting} />
              </div>
              {errors.investmentAmount && <p className="text-sm text-destructive">{errors.investmentAmount.message}</p>}
            </div>
             <div className="space-y-2">
              <Label htmlFor="interestRate">Interés Pactado (%)</Label>
              <div className="relative">
                <Percent size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input id="interestRate" type="number" step="0.1" className="pl-9" {...register('interestRate')} disabled={isSubmitting} />
              </div>
              {errors.interestRate && <p className="text-sm text-destructive">{errors.interestRate.message}</p>}
            </div>
          </div>
          
          <div className="space-y-2">
              <Label htmlFor="paymentMethod">Método de Pago</Label>
              <Input id="paymentMethod" {...register('paymentMethod')} disabled={isSubmitting} />
              {errors.paymentMethod && <p className="text-sm text-destructive">{errors.paymentMethod.message}</p>}
          </div>


          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Agregar Inversionista
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

