
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
import { Textarea } from '@/components/ui/textarea';
import { useForm, type SubmitHandler, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { DollarSign, Loader2, Percent, PlusCircle, Trash2, Paperclip, Eye, Download, X, Repeat, CalendarClock } from 'lucide-react';
import { useInvestors } from '@/contexts/investors-context';
import { useToast } from '@/hooks/use-toast';
import type { Investor, InvestmentTransaction, Attachment } from '@/lib/types';
import { ScrollArea } from '../ui/scroll-area';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';


const attachmentSchema = z.object({
  name: z.string(),
  type: z.string(),
  size: z.number(),
  url: z.string(),
});

const transactionSchema = z.object({
  id: z.string().optional(),
  date: z.string(),
  type: z.enum(['Inversión Inicial', 'Pago de Interés', 'Abono a Capital', 'Devolución']),
  amount: z.coerce.number().min(0.01, "El monto debe ser mayor a 0"),
  description: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
});

const investorSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('Correo no válido').optional().or(z.literal('')),
  phone: z.string().optional(),
  investmentDate: z.string().min(1, 'La fecha es requerida'),
  investmentAmount: z.coerce.number().min(1, 'El monto debe ser mayor a 0'),
  interestRate: z.coerce.number().min(0, 'La tasa no puede ser negativa'),
  paymentMethod: z.string().min(1, 'El método de pago es requerido'),
  status: z.enum(['Activa', 'Liquidada']),
  transactions: z.array(transactionSchema).optional(),
  paymentType: z.enum(['mensual', 'pago_unico'], { required_error: 'Debes seleccionar un tipo de pago.' }),
  monthlyPaymentDay: z.coerce.number().min(1).max(31).optional(),
  liquidationDate: z.string().optional(),
}).refine(data => {
    if (data.paymentType === 'mensual') return !!data.monthlyPaymentDay;
    return true;
}, {
    message: 'El día de pago es requerido para pagos mensuales.',
    path: ['monthlyPaymentDay'],
}).refine(data => {
    if (data.paymentType === 'pago_unico') return !!data.liquidationDate;
    return true;
}, {
    message: 'La fecha de liquidación es requerida para pago único.',
    path: ['liquidationDate'],
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
  
  const [newTransaction, setNewTransaction] = useState<{type: InvestmentTransaction['type'], amount: string, description: string}>({ type: 'Pago de Interés', amount: '', description: '' });
  const [newAttachments, setNewAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const form = useForm<InvestorFormValues>({
    resolver: zodResolver(investorSchema),
  });

  const paymentType = form.watch('paymentType');
  
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "transactions",
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        ...investor,
        investmentDate: investor.investmentDate ? investor.investmentDate.split('T')[0] : '',
        liquidationDate: investor.liquidationDate ? investor.liquidationDate.split('T')[0] : '',
        transactions: investor.transactions || [],
      });
      setNewTransaction({ type: 'Pago de Interés', amount: '', description: '' });
      setNewAttachments([]);
      setDeleteConfirmation('');
    }
  }, [isOpen, investor, form]);
  
  const handleAddTransaction = async () => {
    if (!newTransaction.amount || isNaN(parseFloat(newTransaction.amount))) {
      toast({ variant: 'destructive', title: 'Error', description: 'Por favor, ingresa un monto válido para la transacción.' });
      return;
    }
    
    let uploadedAttachments: Attachment[] = [];
    if (newAttachments.length > 0) {
        const storage = getStorage();
        const uploadPromises = newAttachments.map(async file => {
            const fileRef = storageRef(storage, `investor_attachments/${investor.id}/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(fileRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            return { name: file.name, type: file.type, size: file.size, url: downloadURL };
        });
        uploadedAttachments = await Promise.all(uploadPromises);
    }
    
    append({ 
      id: crypto.randomUUID(),
      date: new Date().toISOString(), 
      type: newTransaction.type,
      amount: parseFloat(newTransaction.amount),
      description: newTransaction.description,
      attachments: uploadedAttachments,
    });
    
    setNewTransaction({ type: 'Pago de Interés', amount: '', description: '' });
    setNewAttachments([]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setNewAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };
  
  const removeNewAttachment = (index: number) => {
    setNewAttachments(prev => prev.filter((_, i) => i !== index));
  };
  
   const handleDownload = (fileUrl: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
          monthlyPaymentDay: data.paymentType === 'mensual' ? data.monthlyPaymentDay : undefined,
          liquidationDate: data.paymentType === 'pago_unico' ? data.liquidationDate : undefined,
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
            Actualiza la información y el historial de transacciones.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] pr-2 -mr-4">
        <ScrollArea className="h-[65vh] pr-4">
          <div className="space-y-4 p-1">
             <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                  <Label htmlFor="edit-name">Nombre del Inversionista</Label>
                  <Input id="edit-name" {...form.register('name')} />
                  {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
              </div>
               <div className="space-y-2">
                <Label htmlFor="status">Estado</Label>
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                     <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Activa">Activa</SelectItem>
                            <SelectItem value="Liquidada">Liquidada</SelectItem>
                        </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-email">Correo Electrónico</Label>
                    <Input id="edit-email" type="email" {...form.register('email')} />
                    {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit-phone">Teléfono</Label>
                    <Input id="edit-phone" {...form.register('phone')} />
                </div>
            </div>
            
             <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="investmentDate">Fecha de Inversión</Label>
                <Input id="investmentDate" type="date" {...form.register('investmentDate')} />
                 {form.formState.errors.investmentDate && <p className="text-sm text-destructive">{form.formState.errors.investmentDate.message}</p>}
              </div>
              <div className="space-y-2">
                  <Label htmlFor="paymentMethod">Método de Pago</Label>
                  <Input id="paymentMethod" {...form.register('paymentMethod')} />
                  {form.formState.errors.paymentMethod && <p className="text-sm text-destructive">{form.formState.errors.paymentMethod.message}</p>}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="investmentAmount">Monto Invertido ($)</Label>
                  <div className="relative">
                    <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input id="investmentAmount" type="number" className="pl-9" {...form.register('investmentAmount')} />
                  </div>
                  {form.formState.errors.investmentAmount && <p className="text-sm text-destructive">{form.formState.errors.investmentAmount.message}</p>}
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="interestRate">Interés Pactado (%)</Label>
                  <div className="relative">
                    <Percent size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input id="interestRate" type="number" step="0.1" className="pl-9" {...form.register('interestRate')} />
                  </div>
                  {form.formState.errors.interestRate && <p className="text-sm text-destructive">{form.formState.errors.interestRate.message}</p>}
                </div>
            </div>

            <div className="space-y-4 pt-4 border-t">
                 <Label className="text-base font-semibold">Esquema de Pago</Label>
                 <Controller
                    name="paymentType"
                    control={form.control}
                    render={({ field }) => (
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
                    )}
                />
                 {form.formState.errors.paymentType && <p className="text-sm text-destructive">{form.formState.errors.paymentType.message}</p>}


                {paymentType === 'mensual' && (
                    <div className="space-y-2">
                        <Label htmlFor="monthlyPaymentDay">Día de pago mensual (1-31)</Label>
                        <Input id="monthlyPaymentDay" type="number" min="1" max="31" {...form.register('monthlyPaymentDay')} />
                        {form.formState.errors.monthlyPaymentDay && <p className="text-sm text-destructive">{form.formState.errors.monthlyPaymentDay.message}</p>}
                    </div>
                )}
                {paymentType === 'pago_unico' && (
                    <div className="space-y-2">
                        <Label htmlFor="liquidationDate">Fecha de liquidación total</Label>
                        <Input id="liquidationDate" type="date" {...form.register('liquidationDate')} />
                        {form.formState.errors.liquidationDate && <p className="text-sm text-destructive">{form.formState.errors.liquidationDate.message}</p>}
                    </div>
                )}
            </div>

            <div className="space-y-4 pt-4 border-t">
              <Label className="text-base font-semibold">Historial de Transacciones</Label>
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex flex-col gap-3 p-3 bg-muted/50 rounded-lg text-sm">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="font-semibold text-foreground">{field.type}</p>
                            <p className="text-xs text-muted-foreground">
                                {format(new Date(field.date), "dd/MM/yyyy 'a las' HH:mm", { locale: es })}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-lg text-foreground">${field.amount.toLocaleString()}</span>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(index)}>
                              <Trash2 size={14}/>
                            </Button>
                        </div>
                    </div>
                    {field.description && <p className="text-foreground text-xs italic">"{field.description}"</p>}
                    {field.attachments && field.attachments.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground">Archivos adjuntos:</p>
                            {field.attachments.map((file, fileIdx) => (
                                <div key={fileIdx} className="flex items-center justify-between text-xs p-1.5 bg-background rounded">
                                    <span>{file.name}</span>
                                    <div className="flex gap-1">
                                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => window.open(file.url, '_blank')}><Eye size={12} /></Button>
                                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDownload(file.url, file.name)}><Download size={12} /></Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                  </div>
                ))}
                {fields.length === 0 && <p className="text-center text-muted-foreground text-xs italic py-4">No hay transacciones registradas.</p>}
              </div>

              <div className="p-4 border rounded-lg space-y-4">
                  <h4 className="font-semibold">Agregar Nueva Transacción</h4>
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Tipo de Transacción</Label>
                        <Select value={newTransaction.type} onValueChange={(value) => setNewTransaction(prev => ({...prev, type: value as InvestmentTransaction['type']}))}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Pago de Interés">Pago de Interés</SelectItem>
                                <SelectItem value="Abono a Capital">Abono a Capital</SelectItem>
                                <SelectItem value="Devolución">Devolución</SelectItem>
                                <SelectItem value="Inversión Inicial">Inversión Inicial</SelectItem>
                            </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Monto</Label>
                        <Input value={newTransaction.amount} onChange={(e) => setNewTransaction(prev => ({...prev, amount: e.target.value}))} type="number" placeholder="0.00"/>
                      </div>
                  </div>
                  <div className="space-y-2">
                      <Label>Descripción (Opcional)</Label>
                      <Textarea value={newTransaction.description} onChange={(e) => setNewTransaction(prev => ({...prev, description: e.target.value}))} placeholder="Notas sobre la transacción..."/>
                  </div>
                  <div className="space-y-2">
                    <Label>Adjuntar Comprobantes</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Paperclip className="mr-2 h-4 w-4"/>Adjuntar</Button>
                    <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileChange} />
                    <div className="space-y-1">
                        {newAttachments.map((file, index) => (
                            <div key={index} className="flex items-center justify-between text-xs p-1 bg-muted rounded">
                                <span>{file.name}</span>
                                <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeNewAttachment(index)}><X size={12} /></Button>
                            </div>
                        ))}
                    </div>
                  </div>
                  <Button type="button" onClick={handleAddTransaction} disabled={!newTransaction.amount}>
                    <PlusCircle size={16} className="mr-2" /> Añadir Transacción
                  </Button>
              </div>
            </div>
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
      </DialogContent>
    </Dialog>
  );
}
