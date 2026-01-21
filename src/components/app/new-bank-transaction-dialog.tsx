
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
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { DollarSign, Loader2 } from 'lucide-react';
import { useBanks } from '@/contexts/banks-context';
import { useToast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Textarea } from '../ui/textarea';

const transactionSchema = z.object({
  date: z.string().min(1, 'La fecha es requerida'),
  description: z.string().min(1, 'La descripción es requerida'),
  amount: z.coerce.number().min(0.01, 'El monto debe ser mayor a 0'),
  type: z.enum(['ingreso', 'egreso'], { required_error: 'Debes seleccionar un tipo de transacción.' }),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

const defaultValues: TransactionFormValues = {
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: 0,
    type: 'egreso',
};

interface NewBankTransactionDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  bankAccountId: string;
}

export default function NewBankTransactionDialog({
  isOpen,
  onOpenChange,
  bankAccountId,
}: NewBankTransactionDialogProps) {
  const { addBankTransaction } = useBanks();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues,
  });


  useEffect(() => {
    if(!isOpen) {
      reset(defaultValues);
    }
  }, [isOpen, reset]);


  const onSubmit: SubmitHandler<TransactionFormValues> = async (data) => {
    try {
      addBankTransaction(bankAccountId, data);

      toast({
        title: 'Transacción Agregada',
        description: 'El movimiento ha sido registrado y el saldo actualizado.',
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al agregar la transacción',
        description: error.message || 'Ocurrió un error inesperado.',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar Nueva Transacción</DialogTitle>
          <DialogDescription>
            Registra un nuevo ingreso o egreso para esta cuenta.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          
          <div className="space-y-2">
            <Label>Tipo de Transacción</Label>
             <Controller
                name="type"
                control={control}
                render={({ field }) => (
                <RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-2 gap-4">
                    <div>
                    <RadioGroupItem value="egreso" id="egreso" className="peer sr-only" />
                    <Label htmlFor="egreso" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-rose-500 [&:has([data-state=checked])]:border-rose-500">
                        Egreso
                    </Label>
                    </div>
                    <div>
                    <RadioGroupItem value="ingreso" id="ingreso" className="peer sr-only" />
                    <Label htmlFor="ingreso" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-emerald-500 [&:has([data-state=checked])]:border-emerald-500">
                        Ingreso
                    </Label>
                    </div>
                </RadioGroup>
                )}
            />
            {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
              <Label htmlFor="date">Fecha de la Transacción</Label>
              <Input id="date" type="date" {...register('date')} disabled={isSubmitting} />
              {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
            </div>
             <div className="space-y-2">
              <Label htmlFor="amount">Monto ($)</Label>
              <div className="relative">
                <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input id="amount" type="number" step="0.01" className="pl-9" {...register('amount')} disabled={isSubmitting} />
              </div>
              {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
            </div>
          </div>

           <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea id="description" {...register('description')} placeholder="Ej. Pago a proveedor, depósito de cliente..." disabled={isSubmitting} />
            {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
          </div>
          
          
          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Agregar Transacción
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
