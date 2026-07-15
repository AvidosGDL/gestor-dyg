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
import { DollarSign, Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { useBanks } from '@/contexts/banks-context';
import { useToast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Textarea } from '../ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const transactionSchema = z.object({
  date: z.string().min(1, 'La fecha es requerida'),
  description: z.string().min(1, 'La descripción es requerida'),
  amount: z.coerce.number().min(0.01, 'El monto debe ser mayor a 0').max(999999999999.99),
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
  const [displayAmount, setDisplayAmount] = useState('0.00');

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues,
  });


  useEffect(() => {
    if(!isOpen) {
      form.reset(defaultValues);
      setDisplayAmount('0.00');
    }
  }, [isOpen, form]);


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
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>Tipo de Transacción</FormLabel>
                  <FormControl>
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
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha de la Transacción</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={form.formState.isSubmitting}
                          >
                            {field.value ? (
                              format(parseISO(field.value), "PPP", { locale: es })
                            ) : (
                              <span>Seleccionar fecha</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value ? parseISO(field.value) : undefined}
                          onSelect={(date) => field.onChange(date ? date.toISOString().split('T')[0] : '')}
                          disabled={(date) =>
                            date > new Date() || date < new Date("1900-01-01")
                          }
                          initialFocus
                          locale={es}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto ($)</FormLabel>
                    <FormControl>
                    <div className="relative">
                      <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="text"
                        className="pl-9"
                        value={displayAmount}
                        onFocus={() => setDisplayAmount(displayAmount.replace(/,/g, ''))}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.-]/g, '');
                          setDisplayAmount(val);
                          const num = parseFloat(val);
                          field.onChange(isNaN(num) ? 0 : num);
                        }}
                        onBlur={() => {
                          const num = parseFloat(displayAmount.replace(/,/g, ''));
                          if (!isNaN(num)) {
                            setDisplayAmount(num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                          } else {
                            setDisplayAmount('0.00');
                          }
                        }}
                        disabled={form.formState.isSubmitting}
                      />
                    </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Ej. Pago a proveedor, depósito de cliente..." disabled={form.formState.isSubmitting} />
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
                Agregar Transacción
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
