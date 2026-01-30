

'use client';

import React, { useEffect, useState, useRef } from 'react';
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
import { DollarSign, Loader2, Percent, Trash2, Repeat, CalendarClock, Info, Upload, Eye, Download } from 'lucide-react';
import { useInvestors } from '@/contexts/investors-context';
import { useToast } from '@/hooks/use-toast';
import type { Investor, InvestmentTransaction, Attachment } from '@/lib/types';
import { ScrollArea } from '../ui/scroll-area';
import { format, addMonths, getDate, isPast, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '../ui/alert';
import { cn } from '@/lib/utils';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';


const transactionSchema = z.object({
  id: z.string().optional(),
  date: z.string(),
  type: z.enum(['Inversión Inicial', 'Pago de Interés', 'Abono a Capital', 'Devolución']),
  amount: z.coerce.number().min(0.01, "El monto debe ser mayor a 0"),
  description: z.string().optional(),
  attachments: z.array(z.object({
    name: z.string(),
    type: z.string(),
    size: z.number(),
    url: z.string(),
  })).optional(),
  dueDate: z.string().optional(),
});

const investorSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('Correo no válido').optional().or(z.literal('')),
  phone: z.string().optional(),
  investmentDate: z.string().min(1, 'La fecha es requerida'),
  investmentTerm: z.coerce.number().min(1, "El plazo es requerido"),
  investmentAmount: z.coerce.number().min(1, 'El monto debe ser mayor a 0'),
  interestRate: z.coerce.number().min(0, 'La tasa no puede ser negativa'),
  paymentMethod: z.string().min(1, 'El método de pago es requerido'),
  status: z.enum(['Activa', 'Liquidada']),
  transactions: z.array(transactionSchema).optional(),
  paymentType: z.enum(['mensual', 'pago_unico'], { required_error: 'Debes seleccionar un tipo de pago.' }),
});


type InvestorFormValues = z.infer<typeof investorSchema>;

interface EditInvestorDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  investor: Investor;
}

export default function EditInvestorDialog({
  isOpen,
  onOpenChange,
  investor,
}: EditInvestorDialogProps) {
  const { updateInvestor, deleteInvestor } = useInvestors();
  const { toast } = useToast();
  
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [uploadingMonth, setUploadingMonth] = useState<Date | null>(null);

  const form = useForm<InvestorFormValues>({
    resolver: zodResolver(investorSchema),
  });

  const watchedFields = form.watch(['paymentType', 'investmentDate', 'investmentTerm']);
  const [paymentType, investmentDate, investmentTerm] = watchedFields;
  
  const summary = React.useMemo(() => {
    if (!investmentDate || !investmentTerm) return null;
    
    const startDate = new Date(investmentDate + 'T00:00:00');
    const endDate = addMonths(startDate, investmentTerm);

    if (paymentType === 'mensual') {
      return `Se generará un estado de cuenta los días ${getDate(startDate)} de cada mes. El contrato finaliza el ${format(endDate, 'dd/MM/yyyy', { locale: es })}.`
    }
    if (paymentType === 'pago_unico') {
      return `Se realizará un pago único de capital e intereses el ${format(endDate, 'dd/MM/yyyy', { locale: es })}.`
    }
    return null;
  }, [paymentType, investmentDate, investmentTerm]);

  const paymentSchedule = React.useMemo(() => {
    if (!investor || investor.paymentType !== 'mensual' || !investor.investmentDate || !investor.investmentTerm) {
      return [];
    }
    const schedule = [];
    const startDate = parseISO(investor.investmentDate);
    
    for (let i = 1; i <= investor.investmentTerm; i++) {
      const dueDate = addMonths(startDate, i);
      const transaction = investor.transactions?.find(t => t.dueDate === dueDate.toISOString().split('T')[0] && t.type === 'Pago de Interés');
      
      let status: 'Pagado' | 'Pendiente' | 'Vencido' = 'Pendiente';
      if (transaction) {
        status = 'Pagado';
      } else if (isPast(dueDate)) {
        status = 'Vencido';
      }

      schedule.push({
        dueDate,
        status,
        transaction,
      });
    }
    return schedule;
  }, [investor]);
  
  const monthlyInterestAmount = React.useMemo(() => {
    if (!investor) return 0;
    return (investor.investmentAmount * investor.interestRate) / 100;
  }, [investor]);


  useEffect(() => {
    if (isOpen) {
      form.reset({
        ...investor,
        investmentDate: investor.investmentDate ? investor.investmentDate.split('T')[0] : '',
        transactions: investor.transactions || [],
      });
      setDeleteConfirmation('');
    }
  }, [isOpen, investor, form]);

  const handleUploadProof = async (event: React.ChangeEvent<HTMLInputElement>, dueDate: Date) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingMonth(dueDate);
    toast({ title: 'Subiendo comprobante...', description: 'Por favor, espera.' });

    try {
        const storage = getStorage();
        const fileRef = storageRef(storage, `investor_attachments/${investor.id}/${dueDate.toISOString()}_${file.name}`);
        const snapshot = await uploadBytes(fileRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);

        const newAttachment: Attachment = {
            name: file.name,
            type: file.type,
            size: file.size,
            url: downloadURL,
        };

        const newTransaction: InvestmentTransaction = {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            type: 'Pago de Interés',
            amount: monthlyInterestAmount,
            description: `Pago de interés para ${format(dueDate, 'MMMM yyyy', { locale: es })}`,
            attachments: [newAttachment],
            dueDate: dueDate.toISOString().split('T')[0],
        };
        
        const updatedTransactions = [...(investor.transactions || []), newTransaction];
        updateInvestor(investor.id, { transactions: updatedTransactions });

        toast({ title: '¡Éxito!', description: 'Comprobante subido y pago registrado.' });
    } catch (error) {
        console.error("Error al subir comprobante: ", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo subir el archivo.' });
    } finally {
        setUploadingMonth(null);
    }
  }

  const handleDeleteInvestor = () => {
    deleteInvestor(investor.id);
    toast({
        title: 'Inversionista Eliminado',
        description: `Se ha eliminado a ${investor.name}.`,
    });
    onOpenChange(false);
  }


  const onSubmit: SubmitHandler<InvestorFormValues> = async (data) => {
    try {
      updateInvestor(investor.id, { 
          ...data, 
          transactions: data.transactions || [],
      });
      toast({
        title: 'Inversionista Actualizado',
        description: `Los datos de ${data.name} han sido actualizados.`,
      });
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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editar Inversionista</DialogTitle>
          <DialogDescription>
            Actualiza la información y el calendario de pagos.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] pr-2 -mr-4">
        <ScrollArea className="h-[65vh] pr-4">
          <div className="space-y-4 p-1">
             <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Inversionista</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="Activa">Activa</SelectItem>
                            <SelectItem value="Liquidada">Liquidada</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Correo Electrónico</FormLabel>
                      <FormControl><Input type="email" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>
            
             <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="investmentDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de Inversión</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="investmentTerm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plazo de Inversión</FormLabel>
                     <Select onValueChange={(val) => field.onChange(Number(val))} defaultValue={String(field.value)}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="6">6 meses</SelectItem>
                            <SelectItem value="12">12 meses</SelectItem>
                            <SelectItem value="24">24 meses</SelectItem>
                        </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="investmentAmount"
                  render={({ field: { onChange, value, ...restField } }) => (
                    <FormItem>
                      <FormLabel>Monto Invertido ($)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            type="text"
                            className="pl-9"
                            value={(value || 0).toLocaleString('en-US')}
                            onChange={(e) => {
                              const rawValue = e.target.value.replace(/[^0-9]/g, '');
                              const numericValue = rawValue === '' ? 0 : Number(rawValue);
                              onChange(numericValue);
                            }}
                            onBlur={(e) => {
                              const numericValue = Number(e.target.value.replace(/[^0-9]/g, ''));
                              e.target.value = numericValue.toLocaleString('en-US');
                            }}
                            {...restField}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="interestRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interés Pactado (%)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Percent size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input type="number" step="0.1" className="pl-9" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>
            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Método de Pago</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4 pt-4 border-t">
                 <FormLabel className="text-base font-semibold">Esquema de Pago</FormLabel>
                 <FormField
                    control={form.control}
                    name="paymentType"
                    render={({ field }) => (
                      <FormItem>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-2 gap-4">
                            <div>
                            <RadioGroupItem value="mensual" id="edit-mensual" className="peer sr-only" />
                            <Label htmlFor="edit-mensual" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                                <Repeat className="mb-3 h-6 w-6" />
                                Pago mensual de interés
                            </Label>
                            </div>
                            <div>
                            <RadioGroupItem value="pago_unico" id="edit-pago_unico" className="peer sr-only" />
                            <Label htmlFor="edit-pago_unico" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                              <CalendarClock className="mb-3 h-6 w-6" />
                              Pago único al vencimiento
                            </Label>
                            </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                      </FormItem>
                    )}
                />
                 {summary && (
                    <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                            {summary}
                        </AlertDescription>
                    </Alert>
                 )}
            </div>

            {paymentType === 'mensual' && (
                <div className="space-y-4 pt-4 border-t">
                    <Label className="text-base font-semibold">Calendario de Pagos de Intereses</Label>
                    <div className="space-y-3">
                    {paymentSchedule.map(({ dueDate, status, transaction }) => (
                      <div key={dueDate.toISOString()} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg text-sm">
                        <div className="flex-1">
                          <p className="font-semibold text-foreground">
                            Vencimiento: {format(dueDate, "dd 'de' MMMM, yyyy", { locale: es })}
                          </p>
                          <div className='flex items-center gap-2 mt-1'>
                            <span
                                className={cn(
                                'px-2 py-0.5 rounded-full text-xs font-medium',
                                status === 'Pagado' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
                                status === 'Pendiente' && 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
                                status === 'Vencido' && 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300',
                                )}
                            >
                                {status}
                            </span>
                            {status === 'Pagado' && transaction?.date && (
                                <span className="text-xs text-muted-foreground">
                                    (Pagado el {format(parseISO(transaction.date), 'dd/MM/yyyy')})
                                </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                           {uploadingMonth?.getTime() === dueDate.getTime() ? (
                             <Button size="sm" disabled><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Subiendo...</Button>
                           ) : status !== 'Pagado' ? (
                            <>
                                <input
                                    type="file"
                                    id={`file-upload-${dueDate.toISOString()}`}
                                    className="hidden"
                                    onChange={(e) => handleUploadProof(e, dueDate)}
                                    accept="image/*,.pdf"
                                />
                                <Button asChild size="sm" variant="outline">
                                    <label htmlFor={`file-upload-${dueDate.toISOString()}`}>
                                    <Upload className="mr-2 h-4 w-4"/> Subir Comprobante
                                    </label>
                                </Button>
                            </>
                           ) : (
                                transaction?.attachments?.[0] && (
                                    <Button size="sm" variant="secondary" onClick={() => window.open(transaction.attachments![0].url, '_blank')}>
                                    <Eye className="mr-2 h-4 w-4"/> Ver Comprobante
                                    </Button>
                                )
                           )}
                            <Button size="sm" variant="ghost" disabled>
                                <Download className="mr-2 h-4 w-4"/> Edo. Cuenta
                            </Button>
                        </div>
                      </div>
                    ))}
                    </div>
                </div>
            )}
            
          </div>
          </ScrollArea>
          <DialogFooter className="pt-4 border-t flex justify-between">
             <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar Inversionista
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción no se puede deshacer. Esto eliminará permanentemente al inversionista y todos sus datos asociados. Para confirmar, escribe <strong>ELIMINAR</strong>.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                    id="delete-confirm"
                    placeholder='Escribe "ELIMINAR"'
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    autoComplete="off"
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={deleteConfirmation !== 'ELIMINAR'}
                    onClick={handleDeleteInvestor}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    Confirmar Eliminación
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar Cambios
                </Button>
            </div>
          </DialogFooter>
        </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
