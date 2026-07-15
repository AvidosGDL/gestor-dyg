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
import { DollarSign, Loader2, ImageUp, Link, User } from 'lucide-react';
import { useBanks } from '@/contexts/banks-context';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { BankAccount } from '@/lib/types';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const bankAccountSchema = z.object({
  companyName: z.string().min(1, 'El nombre de la empresa es requerido'),
  bankName: z.string().min(1, 'El nombre del banco es requerido'),
  accountNumber: z.string().optional().or(z.literal('')),
  clabe: z.string().length(18, 'La CLABE debe tener 18 dígitos').optional().or(z.literal('')),
  cardNumber: z.string().length(16, 'La tarjeta debe tener 16 dígitos').optional().or(z.literal('')),
  initialBalance: z.coerce.number().min(-999999999999.99).max(999999999999.99),
  balanceDate: z.string().min(1, 'La fecha del saldo es requerida'),
  portalUrl: z.string().url('Ingresa una URL válida').optional().or(z.literal('')),
  portalUser: z.string().optional(),
});


type BankAccountFormValues = z.infer<typeof bankAccountSchema>;

interface EditBankDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  bankAccount: BankAccount;
}

export default function EditBankDialog({
  isOpen,
  onOpenChange,
  bankAccount
}: EditBankDialogProps) {
  const { updateBankAccount } = useBanks();
  const { toast } = useToast();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(bankAccount.logoUrl);
  const [displayBalance, setDisplayBalance] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<BankAccountFormValues>({
    resolver: zodResolver(bankAccountSchema),
  });


  useEffect(() => {
    if(isOpen) {
      form.reset({
        ...bankAccount,
        accountNumber: bankAccount.accountNumber || '',
        clabe: bankAccount.clabe || '',
        cardNumber: bankAccount.cardNumber || '',
        balanceDate: bankAccount.balanceDate ? bankAccount.balanceDate.split('T')[0] : '',
        portalUrl: bankAccount.portalUrl || '',
        portalUser: bankAccount.portalUser || '',
      });
      setLogoFile(null);
      setLogoPreview(bankAccount.logoUrl);
      setDisplayBalance(bankAccount.initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }
  }, [isOpen, bankAccount, form]);

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
      await updateBankAccount(bankAccount.id, data, logoFile);

      toast({
        title: 'Cuenta Bancaria Actualizada',
        description: `La cuenta en ${data.bankName} ha sido actualizada.`,
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al actualizar cuenta',
        description: error.message || 'Ocurrió un error inesperado.',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Cuenta Bancaria</DialogTitle>
          <DialogDescription>
            Actualiza los datos de la cuenta. El saldo actual se recalcula si ajustas el saldo inicial.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          
          <FormField
            control={form.control}
            name="companyName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre de la Empresa</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Ej. Mi Empresa S.A. de C.V." disabled={form.formState.isSubmitting} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="bankName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre del Banco</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Ej. BBVA México" disabled={form.formState.isSubmitting} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
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
                  Cambiar Imagen
                </Button>
                {logoPreview && <Button type="button" variant="ghost" size="sm" onClick={() => { setLogoFile(null); setLogoPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>Quitar</Button>}
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} />
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            <FormField
              control={form.control}
              name="accountNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de Cuenta (Opcional)</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={form.formState.isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cardNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de Tarjeta (16 dígitos, opcional)</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={16} disabled={form.formState.isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="clabe"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CLABE (18 dígitos, opcional)</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={18} disabled={form.formState.isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
           <div className="grid grid-cols-2 gap-4">
            <FormField
                control={form.control}
                name="initialBalance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Saldo Inicial ($)</FormLabel>
                    <FormControl>
                    <div className="relative">
                      <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                          type="text"
                          className="pl-9"
                          value={displayBalance}
                          onFocus={() => setDisplayBalance(displayBalance.replace(/,/g, ''))}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9.-]/g, '');
                            setDisplayBalance(val);
                            const num = parseFloat(val);
                            field.onChange(isNaN(num) ? 0 : num);
                          }}
                          onBlur={() => {
                            const num = parseFloat(displayBalance.replace(/,/g, ''));
                            if (!isNaN(num)) {
                              setDisplayBalance(num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                            } else {
                              setDisplayBalance('0.00');
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
             <FormField
              control={form.control}
              name="balanceDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha del Saldo Inicial</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} disabled={form.formState.isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-4 pt-4 border-t">
                <h4 className="text-sm font-semibold flex items-center gap-2"><Link size={14}/> Accesos a Banca</h4>
                <FormField
                    control={form.control}
                    name="portalUrl"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>URL de Acceso</FormLabel>
                        <FormControl>
                        <Input {...field} placeholder="https://banca.ejemplo.com" disabled={form.formState.isSubmitting} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="portalUser"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Usuario Predefinido</FormLabel>
                        <FormControl>
                        <div className="relative">
                             <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                             <Input {...field} className="pl-9" placeholder="usuario123" disabled={form.formState.isSubmitting} />
                        </div>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
            </div>
          
          <DialogFooter className="pt-4">
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
