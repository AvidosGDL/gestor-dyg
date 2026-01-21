
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
import { DollarSign, Loader2 } from 'lucide-react';
import { useBanks } from '@/contexts/banks-context';
import { useToast } from '@/hooks/use-toast';

const bankAccountSchema = z.object({
  bankName: z.string().min(1, 'El nombre del banco es requerido'),
  accountNumber: z.string().min(1, 'El número de cuenta es requerido'),
  clabe: z.string().length(18, 'La CLABE debe tener 18 dígitos').optional().or(z.literal('')),
  logoUrl: z.string().url('URL del logo no válida').optional().or(z.literal('')),
  initialBalance: z.coerce.number(),
  balanceDate: z.string().min(1, 'La fecha del saldo es requerida'),
});


type BankAccountFormValues = z.infer<typeof bankAccountSchema>;

const defaultValues: Partial<BankAccountFormValues> = {
    bankName: '',
    accountNumber: '',
    clabe: '',
    logoUrl: '',
    initialBalance: 0,
    balanceDate: new Date().toISOString().split('T')[0],
};

interface NewBankDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function NewBankDialog({
  open,
  onOpenChange,
}: NewBankDialogProps) {
  const { addBankAccount } = useBanks();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BankAccountFormValues>({
    resolver: zodResolver(bankAccountSchema),
    defaultValues,
  });


  useEffect(() => {
    if(!open) {
      reset(defaultValues);
    }
  }, [open, reset]);


  const onSubmit: SubmitHandler<BankAccountFormValues> = async (data) => {
    try {
      addBankAccount({
        ...data,
        clabe: data.clabe || '',
        logoUrl: data.logoUrl || '',
      });

      toast({
        title: 'Cuenta Bancaria Agregada',
        description: `La cuenta en ${data.bankName} ha sido añadida.`,
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al agregar cuenta',
        description: error.message || 'Ocurrió un error inesperado.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar Nueva Cuenta Bancaria</DialogTitle>
          <DialogDescription>
            Registra una nueva cuenta para seguimiento de saldos y transacciones.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          
          <div className="space-y-2">
            <Label htmlFor="bankName">Nombre del Banco</Label>
            <Input id="bankName" {...register('bankName')} placeholder="Ej. BBVA México" disabled={isSubmitting} />
            {errors.bankName && <p className="text-sm text-destructive">{errors.bankName.message}</p>}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="logoUrl">URL del Logo del Banco (Opcional)</Label>
            <Input id="logoUrl" {...register('logoUrl')} placeholder="https://..." disabled={isSubmitting} />
            {errors.logoUrl && <p className="text-sm text-destructive">{errors.logoUrl.message}</p>}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="accountNumber">Número de Cuenta</Label>
                <Input id="accountNumber" {...register('accountNumber')} disabled={isSubmitting} />
                {errors.accountNumber && <p className="text-sm text-destructive">{errors.accountNumber.message}</p>}
            </div>
            <div className="space-y-2">
                <Label htmlFor="clabe">CLABE (18 dígitos, opcional)</Label>
                <Input id="clabe" {...register('clabe')} disabled={isSubmitting} />
                 {errors.clabe && <p className="text-sm text-destructive">{errors.clabe.message}</p>}
            </div>
          </div>
          
           <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="initialBalance">Saldo Inicial ($)</Label>
              <div className="relative">
                <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input id="initialBalance" type="number" step="0.01" className="pl-9" {...register('initialBalance')} disabled={isSubmitting} />
              </div>
              {errors.initialBalance && <p className="text-sm text-destructive">{errors.initialBalance.message}</p>}
            </div>
             <div className="space-y-2">
              <Label htmlFor="balanceDate">Fecha del Saldo</Label>
              <Input id="balanceDate" type="date" {...register('balanceDate')} disabled={isSubmitting} />
              {errors.balanceDate && <p className="text-sm text-destructive">{errors.balanceDate.message}</p>}
            </div>
          </div>
          
          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Agregar Cuenta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
