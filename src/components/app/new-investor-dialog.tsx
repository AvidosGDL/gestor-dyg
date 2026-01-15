

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
import { DollarSign, Loader2, Percent, Paperclip, X } from 'lucide-react';
import { useInvestors } from '@/contexts/investors-context';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import type { Attachment } from '@/lib/types';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

const investorSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('Correo no válido').optional().or(z.literal('')),
  phone: z.string().optional(),
  investmentDate: z.string().min(1, 'La fecha es requerida'),
  investmentAmount: z.coerce.number().min(1, 'El monto debe ser mayor a 0'),
  interestRate: z.coerce.number().min(0, 'La tasa no puede ser negativa'),
  paymentMethod: z.string().min(1, 'El método de pago es requerido'),
  status: z.enum(['Activa', 'Liquidada']),
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

const defaultValues: Partial<InvestorFormValues> = {
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);


  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<InvestorFormValues>({
    resolver: zodResolver(investorSchema),
    defaultValues,
  });
  
  const paymentType = watch('paymentType');

  useEffect(() => {
    if(!open) {
      reset(defaultValues);
      setAttachedFiles([]);
    }
  }, [open, reset]);

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
            // We need an investor ID, but we don't have one yet. We'll use a temporary UUID for the path.
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
        monthlyPaymentDay: data.paymentType === 'mensual' ? data.monthlyPaymentDay : undefined,
        liquidationDate: data.paymentType === 'pago_unico' ? data.liquidationDate : undefined,
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] pr-4 -mr-4 overflow-y-auto">
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
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                     <Select onValueChange={field.onChange} defaultValue={defaultValues.status}>
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

            <div className="space-y-4 pt-4 border-t">
                 <Controller
                    name="paymentType"
                    control={control}
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
                 {errors.paymentType && <p className="text-sm text-destructive">{errors.paymentType.message}</p>}


                {paymentType === 'mensual' && (
                    <div className="space-y-2">
                        <Label htmlFor="monthlyPaymentDay">Día de pago mensual (1-31)</Label>
                        <Input id="monthlyPaymentDay" type="number" min="1" max="31" {...register('monthlyPaymentDay')} disabled={isSubmitting} />
                        {errors.monthlyPaymentDay && <p className="text-sm text-destructive">{errors.monthlyPaymentDay.message}</p>}
                    </div>
                )}
                {paymentType === 'pago_unico' && (
                    <div className="space-y-2">
                        <Label htmlFor="liquidationDate">Fecha de liquidación total</Label>
                        <Input id="liquidationDate" type="date" {...register('liquidationDate')} disabled={isSubmitting} />
                        {errors.liquidationDate && <p className="text-sm text-destructive">{errors.liquidationDate.message}</p>}
                    </div>
                )}
            </div>
            
            <div className="space-y-2 pt-4 border-t">
                <Label>Comprobante de Inversión Inicial</Label>
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isSubmitting}>
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


