
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
import { DollarSign, Loader2, Calendar as CalendarIcon, Tag, X, Plus, Building2, FileText } from 'lucide-react';
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
import { Badge } from '../ui/badge';
import type { BankTransaction } from '@/lib/types';

const transactionSchema = z.object({
  date: z.string().min(1, 'La fecha es requerida'),
  description: z.string().min(1, 'La descripción es requerida'),
  amount: z.coerce.number().min(0.01, 'El monto debe ser mayor a 0').max(999999999999.99),
  type: z.enum(['ingreso', 'egreso'], { required_error: 'Debes seleccionar un tipo de transacción.' }),
  categories: z.array(z.string()).optional(),
  entityName: z.string().optional(),
  invoiceReference: z.string().optional(),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

const DEFAULT_CATEGORIES = ['Nómina', 'Impuestos', 'Servicios', 'Ventas', 'Honorarios', 'Renta', 'Suministros', 'Inversión'];

interface EditBankTransactionDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  bankAccountId: string;
  transaction: BankTransaction;
}

export default function EditBankTransactionDialog({
  isOpen,
  onOpenChange,
  bankAccountId,
  transaction
}: EditBankTransactionDialogProps) {
  const { updateBankTransaction } = useBanks();
  const { toast } = useToast();
  const [displayAmount, setDisplayAmount] = useState('');
  const [newCategory, setNewCategory] = useState('');

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
  });

  const selectedCategories = form.watch('categories') || [];
  const selectedType = form.watch('type');

  useEffect(() => {
    if(isOpen && transaction) {
      form.reset({
        date: transaction.date.split('T')[0],
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        categories: transaction.categories || [],
        entityName: transaction.entityName || '',
        invoiceReference: transaction.invoiceReference || '',
      });
      setDisplayAmount(transaction.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      setNewCategory('');
    }
  }, [isOpen, transaction, form]);

  const toggleCategory = (cat: string) => {
    const current = form.getValues('categories') || [];
    if (current.includes(cat)) {
        form.setValue('categories', current.filter(c => c !== cat));
    } else {
        form.setValue('categories', [...current, cat]);
    }
  };

  const addCustomCategory = () => {
    if (newCategory.trim() && !selectedCategories.includes(newCategory.trim())) {
        form.setValue('categories', [...selectedCategories, newCategory.trim()]);
        setNewCategory('');
    }
  };


  const onSubmit: SubmitHandler<TransactionFormValues> = async (data) => {
    try {
      await updateBankTransaction(bankAccountId, transaction.id, data);
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al actualizar',
        description: error.message || 'Ocurrió un error inesperado.',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Transacción</DialogTitle>
          <DialogDescription>
            Modifica los detalles del movimiento bancario.
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
                      <RadioGroupItem value="egreso" id="edit-tx-egreso" className="peer sr-only" />
                      <Label htmlFor="edit-tx-egreso" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-rose-500 [&:has([data-state=checked])]:border-rose-500 cursor-pointer">
                          Egreso
                      </Label>
                      </div>
                      <div>
                      <RadioGroupItem value="ingreso" id="edit-tx-ingreso" className="peer sr-only" />
                      <Label htmlFor="edit-tx-ingreso" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-emerald-500 [&:has([data-state=checked])]:border-emerald-500 cursor-pointer">
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
                              format(new Date(field.value + 'T12:00:00'), "PPP", { locale: es })
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
                          selected={field.value ? new Date(field.value + 'T12:00:00') : undefined}
                          onSelect={(date) => {
                            if (date) {
                              const y = date.getFullYear();
                              const m = String(date.getMonth() + 1).padStart(2, '0');
                              const d = String(date.getDate()).padStart(2, '0');
                              field.onChange(`${y}-${m}-${d}`);
                            }
                          }}
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="entityName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{selectedType === 'ingreso' ? 'Empresa / Cliente que depositó' : 'Empresa / Proveedor pagado'}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input {...field} className="pl-9" placeholder="Nombre opcional..." disabled={form.formState.isSubmitting} />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="invoiceReference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Referencia / Factura</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input {...field} className="pl-9" placeholder="ID de factura opcional..." disabled={form.formState.isSubmitting} />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción de Concepto</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Ej. Pago a proveedor, depósito de cliente..." disabled={form.formState.isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3">
                <FormLabel className="flex items-center gap-2"><Tag size={14}/> Categorías (Chips)</FormLabel>
                <div className="flex flex-wrap gap-2 mb-2">
                    {DEFAULT_CATEGORIES.map(cat => (
                        <Badge 
                            key={cat} 
                            variant={selectedCategories.includes(cat) ? "default" : "outline"}
                            className="cursor-pointer hover:bg-primary/20 transition-colors py-1 px-3"
                            onClick={() => toggleCategory(cat)}
                        >
                            {cat}
                        </Badge>
                    ))}
                    {selectedCategories.filter(c => !DEFAULT_CATEGORIES.includes(c)).map(cat => (
                         <Badge 
                            key={cat} 
                            variant="default"
                            className="cursor-pointer py-1 px-3 flex items-center gap-2"
                            onClick={() => toggleCategory(cat)}
                        >
                            {cat} <X size={10} className="hover:text-destructive"/>
                        </Badge>
                    ))}
                </div>
                <div className="flex gap-2">
                    <Input 
                        placeholder="Nueva categoría..." 
                        value={newCategory} 
                        onChange={e => setNewCategory(e.target.value)}
                        className="h-8 text-xs"
                        onKeyDown={e => { if(e.key === 'Enter') { e.preventDefault(); addCustomCategory(); }}}
                    />
                    <Button type="button" size="sm" variant="outline" className="h-8" onClick={addCustomCategory}>
                        <Plus size={14} />
                    </Button>
                </div>
            </div>
            
            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar Cambios
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
