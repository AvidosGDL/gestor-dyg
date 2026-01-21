
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
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { DollarSign, Loader2, ImageUp } from 'lucide-react';
import { useBanks } from '@/contexts/banks-context';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';

const bankAccountSchema = z.object({
  companyName: z.string().min(1, 'El nombre de la empresa es requerido'),
  bankName: z.string().min(1, 'El nombre del banco es requerido'),
  accountNumber: z.string().min(1, 'El número de cuenta es requerido'),
  clabe: z.string().length(18, 'La CLABE debe tener 18 dígitos').optional().or(z.literal('')),
  initialBalance: z.coerce.number(),
  balanceDate: z.string().min(1, 'La fecha del saldo es requerida'),
});


type BankAccountFormValues = z.infer<typeof bankAccountSchema>;

const defaultValues: Partial<BankAccountFormValues> = {
    companyName: '',
    bankName: '',
    accountNumber: '',
    clabe: '',
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
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setLogoFile(null);
      setLogoPreview(null);
    }
  }, [open, reset]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };


  const onSubmit: SubmitHandler<BankAccountFormValues> = async (data) => {
    try {
      await addBankAccount(data, logoFile);

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
            <Label htmlFor="companyName">Nombre de la Empresa</Label>
            <Input id="companyName" {...register('companyName')} placeholder="Ej. Mi Empresa S.A. de C.V." disabled={isSubmitting} />
            {errors.companyName && <p className="text-sm text-destructive">{errors.companyName.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="bankName">Nombre del Banco</Label>
            <Input id="bankName" {...register('bankName')} placeholder="Ej. BBVA México" disabled={isSubmitting} />
            {errors.bankName && <p className="text-sm text-destructive">{errors.bankName.message}</p>}
          </div>
          
          <div className="space-y-2">
            <Label>Logo del Banco (Opcional)</Label>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 rounded-md">
                {logoPreview ? (
                  <AvatarImage src={logoPreview} alt="Vista previa del logo" className="object-contain" />
                ) : (
                  <AvatarFallback className="rounded-md bg-muted">
                    <ImageUp className="h-8 w-8 text-muted-foreground" />
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="flex flex-col gap-2">
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  Subir Imagen
                </Button>
                {logoFile && <Button type="button" variant="ghost" size="sm" onClick={() => { setLogoFile(null); setLogoPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>Quitar</Button>}
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} />
            </div>
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
