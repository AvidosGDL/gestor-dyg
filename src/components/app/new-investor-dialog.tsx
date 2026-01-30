

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
import { DollarSign, Loader2, Percent, Paperclip, X, Info } from 'lucide-react';
import { useInvestors } from '@/contexts/investors-context';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import type { Attachment } from '@/lib/types';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { addMonths, format, getDate } from 'date-fns';
import { es } from 'date-fns/locale';
import { Alert, AlertDescription } from '../ui/alert';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';


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
  paymentType: z.enum(['mensual', 'pago_unico'], { required_error: 'Debes seleccionar un tipo de pago.' }),
});


type InvestorFormValues = z.infer<typeof investorSchema>;

const defaultValues: Partial<InvestorFormValues> = {
    name: '',
    email: '',
    phone: '',
    investmentDate: new Date().toISOString().split('T')[0],
    investmentTerm: 12,
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);


  const form = useForm<InvestorFormValues>({
    resolver: zodResolver(investorSchema),
    defaultValues,
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


  useEffect(() => {
    if(!open) {
      form.reset(defaultValues);
      setAttachedFiles([]);
    }
  }, [open, form]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setAttachedFiles(prevFiles => [...prevFiles, ...Array.from(event.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
  };


  const onSubmit: SubmitHandler<InvestorFormValues> = async (data) => {
    let uploadedAttachments: Attachment[] = [];
    try {
        if (attachedFiles.length > 0) {
            const storage = getStorage();
            const tempId = crypto.randomUUID();
            const uploadPromises = attachedFiles.map(async file => {
                const fileRef = storageRef(storage, `investor_attachments/${tempId}/${Date.now()}_${file.name}`);
                const snapshot = await uploadBytes(fileRef, file);
                const downloadURL = await getDownloadURL(snapshot.ref);
                return { name: file.name, type: file.type, size: file.size, url: downloadURL };
            });
            uploadedAttachments = await Promise.all(uploadPromises);
        }

      const initialTransaction = {
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          type: 'Inversión Inicial' as const,
          amount: data.investmentAmount,
          description: 'Inversión inicial del capital.',
          attachments: uploadedAttachments,
      };

      addInvestor({
        ...data,
        transactions: [initialTransaction],
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
        description: error.message || 'Ocurrió un error inesperado al subir archivos.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Agregar Nuevo Inversionista</DialogTitle>
          <DialogDescription>
            Registra un nuevo ingreso de capital y define su esquema de pago.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] pr-4 -mr-4 overflow-y-auto">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre del Inversionista</FormLabel>
                <FormControl><Input {...field} disabled={form.formState.isSubmitting} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Correo Electrónico</FormLabel>
                  <FormControl><Input type="email" {...field} disabled={form.formState.isSubmitting} /></FormControl>
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
                  <FormControl><Input {...field} disabled={form.formState.isSubmitting} /></FormControl>
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
                  <FormControl><Input type="date" {...field} disabled={form.formState.isSubmitting} /></FormControl>
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
                      disabled={form.formState.isSubmitting}
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
                      <Input type="number" step="0.1" className="pl-9" {...field} disabled={form.formState.isSubmitting} />
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
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Método de Pago</FormLabel>
                    <FormControl><Input {...field} disabled={form.formState.isSubmitting} /></FormControl>
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
                   <Select onValueChange={field.onChange} defaultValue={defaultValues.status}>
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

            <div className="space-y-4 pt-4 border-t">
                 <Label>Esquema de Pago de Intereses</Label>
                 <Controller
                    name="paymentType"
                    control={form.control}
                    render={({ field }) => (
                    <RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-2 gap-4">
                        <div>
                        <RadioGroupItem value="mensual" id="mensual" className="peer sr-only" />
                        <Label htmlFor="mensual" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                            Pago mensual de interés
                        </Label>
                        </div>
                        <div>
                        <RadioGroupItem value="pago_unico" id="pago_unico" className="peer sr-only" />
                        <Label htmlFor="pago_unico" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                            Pago único al vencimiento
                        </Label>
                        </div>
                    </RadioGroup>
                    )}
                />
                 {form.formState.errors.paymentType && <p className="text-sm text-destructive">{form.formState.errors.paymentType.message}</p>}
                 {summary && (
                    <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                            {summary}
                        </AlertDescription>
                    </Alert>
                 )}
            </div>
            
            <div className="space-y-2 pt-4 border-t">
                <Label>Comprobante de Inversión Inicial</Label>
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={form.formState.isSubmitting}>
                    <Paperclip className="mr-2 h-4 w-4"/>Adjuntar Archivo(s)
                </Button>
                <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileChange} />
                <div className="space-y-1">
                    {attachedFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between text-xs p-1 bg-muted rounded">
                            <span>{file.name}</span>
                            <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeFile(index)}><X size={12} /></Button>
                        </div>
                    ))}
                </div>
            </div>


          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Agregar Inversionista
            </Button>
          </DialogFooter>
        </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}


    
