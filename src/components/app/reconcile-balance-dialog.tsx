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
import { DollarSign, Loader2, Scale } from 'lucide-react';
import { useBanks } from '@/contexts/banks-context';
import { useToast } from '@/hooks/use-toast';
import { BankAccount } from '@/lib/types';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const reconcileSchema = z.object({
  date: z.string().min(1, 'La fecha es requerida'),
  balance: z.coerce.number().min(-9999999999.99).max(9999999999.99),
});

type ReconcileFormValues = z.infer<typeof reconcileSchema>;

interface ReconcileBalanceDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  bankAccount: BankAccount;
}

export default function ReconcileBalanceDialog({
  isOpen,
  onOpenChange,
  bankAccount,
}: ReconcileBalanceDialogProps) {
  const { reconcileBalance } = useBanks();
  const { toast } = useToast();

  const form = useForm<ReconcileFormValues>({
    resolver: zodResolver(reconcileSchema),
    defaultValues: {
        date: new Date().toISOString().split('T')[0],
        balance: bankAccount.currentBalance,
    }
  });

  useEffect(() => {
    if(isOpen) {
      form.reset({
        date: new Date().toISOString().split('T')[0],
        balance: bankAccount.currentBalance,
      });
    }
  }, [isOpen, bankAccount, form]);

  const onSubmit: SubmitHandler<ReconcileFormValues> = async (data) => {
    try {
      await reconcileBalance(bankAccount.id, data.date, data.balance);
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al conciliar',
        description: error.message || 'Ocurrió un error inesperado.',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="text-primary" />
            Conciliar Saldo Manualmente
          </DialogTitle>
          <DialogDescription>
            Ingresa el saldo real de tu cuenta a una fecha de corte. Si hay diferencia con el sistema, se generará un ajuste automático.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de Corte (Estado de Cuenta)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} disabled={form.formState.isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="balance"
              render={({ field: { onChange, value, ...restField } }) => (
                <FormItem>
                  <FormLabel>Saldo Real a esa Fecha ($)</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="text"
                        className="pl-9"
                        value={(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        onChange={(e) => {
                          const rawValue = e.target.value.replace(/[^0-9.-]/g, '');
                          onChange(rawValue === '' ? 0 : parseFloat(rawValue));
                        }}
                        onBlur={(e) => {
                          const rawValue = e.target.value.replace(/[^0-9.-]/g, '');
                          const numericValue = rawValue === '' ? 0 : parseFloat(rawValue);
                          e.target.value = numericValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        }}
                        disabled={form.formState.isSubmitting}
                        {...restField}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Actualizar y Cuadrar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
