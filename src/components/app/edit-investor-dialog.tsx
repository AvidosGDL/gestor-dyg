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
import { DollarSign, Loader2, Percent, Trash2, Repeat, CalendarClock, Info, Upload, Eye, Download, Landmark, FileText, Briefcase, Plus, Check, FileUp } from 'lucide-react';
import { useInvestors } from '@/contexts/investors-context';
import { useToast } from '@/hooks/use-toast';
import type { Investor, InvestmentTransaction, Attachment, InvestmentUsage } from '@/lib/types';
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';


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

const usageSchema = z.object({
    date: z.string().min(1, "La fecha es requerida"),
    amount: z.coerce.number().min(0.01, "El monto debe ser mayor a 0"),
    description: z.string().min(1, "La descripción es requerida"),
});

const investorSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('Correo no válido').optional().or(z.literal('')),
  phone: z.string().optional(),
  investmentDate: z.string().min(1, 'La fecha es requerida'),
  investmentTerm: z.coerce.number().min(1, "El plazo es requerido"),
  investmentAmount: z.coerce.number().min(1, 'El monto debe ser mayor a 0').max(999999999999.99),
  interestRate: z.coerce.number().min(0, 'La tasa no puede ser negativa'),
  paymentMethod: z.string().min(1, 'El método de pago es requerido'),
  status: z.enum(['Activa', 'Liquidada']),
  transactions: z.array(transactionSchema).optional(),
  fundUsage: z.array(z.any()).optional(),
  paymentType: z.enum(['mensual', 'pago_unico'], { required_error: 'Debes seleccionar un tipo de pago.' }),
  receivingBankName: z.string().min(1, 'El banco receptor es requerido'),
  receivingClabe: z.string().length(18, 'La CLABE debe tener exactamente 18 dígitos'),
});


type InvestorFormValues = z.infer<typeof investorSchema>;

interface EditInvestorDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
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
  const [displayAmount, setDisplayAmount] = useState('');

  // Estados para el flujo de "Uso de Fondos"
  const [showUsageForm, setShowUsageForm] = useState(false);
  const [usageFiles, setUsageFiles] = useState<File[]>([]);
  const usageFileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<InvestorFormValues>({
    resolver: zodResolver(investorSchema),
  });

  const usageForm = useForm<z.infer<typeof usageSchema>>({
      resolver: zodResolver(usageSchema),
      defaultValues: {
          date: new Date().toISOString().split('T')[0],
          amount: 0,
          description: '',
      }
  });

  const watchedFields = form.watch(['paymentType', 'investmentDate', 'investmentTerm']);
  const [paymentType, investmentDate, investmentTerm] = watchedFields;
  
  const totalInvestedUsage = React.useMemo(() => {
    return (investor.fundUsage || []).reduce((sum, u) => sum + u.amount, 0);
  }, [investor.fundUsage]);

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
        fundUsage: investor.fundUsage || [],
        receivingBankName: investor.receivingBankName || '',
        receivingClabe: investor.receivingClabe || '',
      });
      setDeleteConfirmation('');
      setDisplayAmount(investor.investmentAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
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

  const handleAddUsage = async (values: z.infer<typeof usageSchema>) => {
    toast({ title: 'Guardando detalle de inversión...' });
    try {
        let uploadedAttachments: Attachment[] = [];
        if (usageFiles.length > 0) {
            const storage = getStorage();
            const uploadPromises = usageFiles.map(async file => {
                const fileRef = storageRef(storage, `investor_fund_usage/${investor.id}/${Date.now()}_${file.name}`);
                const snap = await uploadBytes(fileRef, file);
                const url = await getDownloadURL(snap.ref);
                return { name: file.name, type: file.type, size: file.size, url };
            });
            uploadedAttachments = await Promise.all(uploadPromises);
        }

        const newUsage: InvestmentUsage = {
            id: crypto.randomUUID(),
            date: values.date,
            amount: values.amount,
            description: values.description,
            attachments: uploadedAttachments,
        };

        const updatedUsage = [...(investor.fundUsage || []), newUsage];
        updateInvestor(investor.id, { fundUsage: updatedUsage });

        toast({ title: 'Registro guardado' });
        setShowUsageForm(false);
        setUsageFiles([]);
        usageForm.reset();
    } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar el registro de uso de fondos.' });
    }
  }

  const generatePeriodPDF = async (dueDate: Date, status: string) => {
    toast({ title: 'Generando Estado de Cuenta...' });
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    // Header Logo
    const logoUrl = 'https://firebasestorage.googleapis.com/v0/b/studio-8033020115-912ac.firebasestorage.app/o/public%2Flogo%20DyG.jpeg?alt=media&token=578d1bd8-b8a4-47b6-a97f-e7731dc39bf1';
    try {
        doc.addImage(logoUrl, 'JPEG', 14, 10, 25, 25);
    } catch (e) {}

    // Title
    doc.setFontSize(18);
    doc.setTextColor(63, 81, 181);
    doc.setFont('helvetica', 'bold');
    doc.text('ESTADO DE CUENTA DE INVERSIÓN', pageWidth - 14, 20, { align: 'right' });
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'normal');
    doc.text(`Periodo: ${format(dueDate, 'MMMM yyyy', { locale: es })}`.toUpperCase(), pageWidth - 14, 26, { align: 'right' });
    doc.text(`Fecha de Emisión: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - 14, 31, { align: 'right' });

    // Investor Data Box
    doc.setFillColor(245, 245, 250);
    doc.rect(14, 45, pageWidth - 28, 40, 'F');
    
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL INVERSIONISTA', 20, 53);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Nombre: ${investor.name}`, 20, 60);
    doc.text(`Email: ${investor.email || 'N/A'}`, 20, 65);
    doc.text(`Teléfono: ${investor.phone || 'N/A'}`, 20, 70);
    doc.text(`Método de Pago: ${investor.paymentMethod}`, 20, 75);

    // Investment Summary
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN DE INVERSIÓN', 120, 53);
    doc.setFont('helvetica', 'normal');
    doc.text(`Capital: $${investor.investmentAmount.toLocaleString('en-US')}`, 120, 60);
    doc.text(`Tasa Anual: ${investor.interestRate}%`, 120, 65);
    doc.text(`Plazo: ${investor.investmentTerm} meses`, 120, 70);
    doc.text(`Inicio: ${format(parseISO(investor.investmentDate), 'dd/MM/yyyy')}`, 120, 75);

    // Payment Details Table
    const tableData = [
        ['Concepto', 'Monto'],
        [`Interés Mensual (${format(dueDate, 'MMMM', { locale: es })})`, `$${monthlyInterestAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],
        ['Retención / Otros', '$0.00'],
        ['TOTAL NETO A PAGAR', `$${monthlyInterestAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]
    ];

    autoTable(doc, {
        startY: 95,
        head: [['Detalle del Periodo', 'Cálculo']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [63, 81, 181] },
        columnStyles: {
            0: { fontStyle: 'bold' },
            1: { halign: 'right' }
        }
    });

    let currentY = (doc as any).lastAutoTable.finalY + 15;

    // Banking Details for Disbursement
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS PARA DISPERSIÓN DE FONDOS', 14, currentY);
    
    currentY += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Institución Bancaria: ${investor.receivingBankName || 'N/A'}`, 14, currentY);
    currentY += 5;
    doc.text(`Cuenta CLABE (18 dígitos): ${investor.receivingClabe || 'N/A'}`, 14, currentY);

    currentY += 15;
    // Status Badge
    doc.setFillColor(status === 'Pagado' ? 220 : 255, status === 'Pagado' ? 250 : 230, status === 'Pagado' ? 220 : 230);
    doc.rect(14, currentY, 50, 10, 'F');
    doc.setTextColor(status === 'Pagado' ? 30 : 150, status === 'Pagado' ? 100 : 50, 50);
    doc.setFont('helvetica', 'bold');
    doc.text(`ESTATUS: ${status.toUpperCase()}`, 18, currentY + 7);

    // Footer Info
    doc.setTextColor(150);
    doc.setFontSize(8);
    doc.text('Este documento es un comprobante informativo del periodo. Los rendimientos están sujetos a los términos del contrato firmado.', pageWidth / 2, 280, { align: 'center' });

    doc.save(`EdoCuenta_${investor.name.replace(/\s/g, '_')}_${format(dueDate, 'yyyyMM')}.pdf`);
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
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Gestión de Inversionista: {investor.name}</DialogTitle>
          <DialogDescription>
            Administra los datos personales, la corrida de pagos y el destino del capital.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="details">Perfil e Inversión</TabsTrigger>
                <TabsTrigger value="payments">Corrida de Pagos</TabsTrigger>
                <TabsTrigger value="usage" className="gap-2">
                    <Briefcase size={14}/> Destino del Capital
                </TabsTrigger>
            </TabsList>

            <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
            
            <TabsContent value="details">
                <ScrollArea className="h-[55vh] pr-4">
                    <div className="space-y-6 p-1">
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
                                <Select onValueChange={(val) => field.onChange(Number(val))} value={String(field.value)}>
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
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Monto Invertido ($)</FormLabel>
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

                        <div className="space-y-4 pt-4 border-t">
                            <h4 className="text-sm font-bold flex items-center gap-2 text-primary">
                                <Landmark size={18} /> Datos Bancarios para Pagos
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="receivingBankName"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Banco Destino</FormLabel>
                                        <FormControl><Input {...field} placeholder="Ej. BBVA, Santander..." /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="receivingClabe"
                                    render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Cuenta CLABE (18 dígitos)</FormLabel>
                                        <FormControl><Input {...field} maxLength={18} placeholder="000000000000000000" /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                            </div>
                        </div>

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
                    </div>
                </ScrollArea>
            </TabsContent>

            <TabsContent value="payments">
                <ScrollArea className="h-[55vh] pr-4">
                    {paymentType === 'mensual' ? (
                        <div className="space-y-3 p-1">
                            {paymentSchedule.map(({ dueDate, status, transaction }) => (
                            <div key={dueDate.toISOString()} className="flex items-center gap-3 p-4 bg-muted/50 rounded-xl text-sm border border-border">
                                <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                    <p className="font-bold text-foreground">
                                        Vencimiento: {format(dueDate, "dd 'de' MMMM, yyyy", { locale: es })}
                                    </p>
                                    <span className="font-mono font-bold text-primary text-base">
                                        ${monthlyInterestAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className='flex items-center gap-2 mt-1'>
                                    <span
                                        className={cn(
                                        'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                                        status === 'Pagado' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
                                        status === 'Pendiente' && 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
                                        status === 'Vencido' && 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300',
                                        )}
                                    >
                                        {status}
                                    </span>
                                    {status === 'Pagado' && transaction?.date && (
                                        <span className="text-[10px] text-muted-foreground italic">
                                            (Pago registrado el {format(parseISO(transaction.date), 'dd/MM/yyyy')})
                                        </span>
                                    )}
                                </div>
                                </div>
                                <div className="flex items-center gap-2">
                                {uploadingMonth?.getTime() === dueDate.getTime() ? (
                                    <Button size="sm" disabled className="h-8"><Loader2 className="mr-2 h-3 w-3 animate-spin"/> Subiendo...</Button>
                                ) : status !== 'Pagado' ? (
                                    <>
                                        <input
                                            type="file"
                                            id={`file-upload-${dueDate.toISOString()}`}
                                            className="hidden"
                                            onChange={(e) => handleUploadProof(e, dueDate)}
                                            accept="image/*,.pdf"
                                        />
                                        <Button asChild size="sm" variant="outline" className="h-8 text-[11px] gap-1.5 border-primary text-primary hover:bg-primary/5">
                                            <label htmlFor={`file-upload-${dueDate.toISOString()}`}>
                                            <Upload className="h-3.5 w-3.5"/> Registrar Pago
                                            </label>
                                        </Button>
                                    </>
                                ) : (
                                        transaction?.attachments?.[0] && (
                                            <Button size="sm" variant="secondary" className="h-8 text-[11px] gap-1.5" onClick={() => window.open(transaction.attachments![0].url, '_blank')}>
                                            <Eye className="h-3.5 w-3.5"/> Comprobante
                                            </Button>
                                        )
                                )}
                                    <Button type="button" size="sm" variant="ghost" className="h-8 text-[11px] gap-1.5 border border-primary/20 hover:bg-primary/5" onClick={() => generatePeriodPDF(dueDate, status)}>
                                        <FileText className="h-3.5 w-3.5 text-primary"/> Edo. Cuenta
                                    </Button>
                                </div>
                            </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full p-12 text-center space-y-4">
                            <CalendarClock size={48} className="text-muted-foreground/30" />
                            <h3 className="font-bold text-lg">Esquema de Pago Único</h3>
                            <p className="text-sm text-muted-foreground max-w-sm">
                                Para este inversionista se ha definido un pago único al vencimiento del contrato. 
                                Puedes registrar la devolución del capital total en la pestaña de perfil una vez liquidada.
                            </p>
                        </div>
                    )}
                </ScrollArea>
            </TabsContent>

            <TabsContent value="usage">
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-primary/5 border-primary/20">
                            <CardContent className="p-4">
                                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Capital Recibido</p>
                                <p className="text-2xl font-bold">${investor.investmentAmount.toLocaleString()}</p>
                            </CardContent>
                        </Card>
                        <Card className="bg-amber-50 border-amber-200">
                            <CardContent className="p-4">
                                <p className="text-[10px] font-bold uppercase text-amber-700 mb-1">Capital Asignado</p>
                                <p className="text-2xl font-bold text-amber-900">${totalInvestedUsage.toLocaleString()}</p>
                            </CardContent>
                        </Card>
                        <Card className={cn(
                            "border-2",
                            (investor.investmentAmount - totalInvestedUsage) > 0 ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"
                        )}>
                            <CardContent className="p-4">
                                <p className="text-[10px] font-bold uppercase mb-1">Remanente en Caja</p>
                                <p className="text-2xl font-bold">${(investor.investmentAmount - totalInvestedUsage).toLocaleString()}</p>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="flex justify-between items-center mt-6">
                        <h4 className="font-bold flex items-center gap-2"><Briefcase size={18}/> Detalle de Inversión / Gasto</h4>
                        {!showUsageForm && (
                            <Button size="sm" onClick={() => setShowUsageForm(true)} className="gap-2">
                                <Plus size={16}/> Definir Nuevo Uso
                            </Button>
                        )}
                    </div>

                    {showUsageForm && (
                        <Card className="border-dashed border-2 bg-muted/20">
                            <CardHeader className="py-4">
                                <CardTitle className="text-sm">Registrar Inversión o Gasto de este Capital</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs">Fecha</Label>
                                        <Input type="date" {...usageForm.register('date')} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">Monto ($)</Label>
                                        <div className="relative">
                                            <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                            <Input type="number" step="0.01" className="pl-8" {...usageForm.register('amount')} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs">Comprobante de Transferencia</Label>
                                        <div className="flex items-center gap-2">
                                            <Button type="button" variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={() => usageFileInputRef.current?.click()}>
                                                <FileUp size={14}/> {usageFiles.length > 0 ? `${usageFiles.length} archivo(s)` : 'Subir Comprobante'}
                                            </Button>
                                            <input 
                                                type="file" 
                                                ref={usageFileInputRef} 
                                                className="hidden" 
                                                multiple 
                                                onChange={(e) => setUsageFiles(Array.from(e.target.files || []))}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">Detalle / Destino de la Inversión</Label>
                                    <Input placeholder="Ej. Pago a constructora X para proyecto Y..." {...usageForm.register('description')} />
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowUsageForm(false)}>Cancelar</Button>
                                    <Button type="button" size="sm" onClick={usageForm.handleSubmit(handleAddUsage)}>Guardar Registro</Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <ScrollArea className="h-[35vh] border rounded-xl bg-card overflow-hidden mt-4">
                        <table className="w-full text-sm">
                            <thead className="bg-muted sticky top-0">
                                <tr className="text-left">
                                    <th className="p-3 font-bold">Fecha</th>
                                    <th className="p-3 font-bold">Destino / Detalle</th>
                                    <th className="p-3 font-bold text-right">Monto</th>
                                    <th className="p-3 font-bold text-right">Evidencia</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {(investor.fundUsage || []).slice().reverse().map((usage) => (
                                    <tr key={usage.id} className="hover:bg-muted/30">
                                        <td className="p-3 whitespace-nowrap">{format(parseISO(usage.date), 'dd/MM/yyyy')}</td>
                                        <td className="p-3">{usage.description}</td>
                                        <td className="p-3 text-right font-mono font-bold">${usage.amount.toLocaleString()}</td>
                                        <td className="p-3 text-right">
                                            <div className="flex justify-end gap-2">
                                                {usage.attachments?.map((att, i) => (
                                                    <Button key={i} variant="ghost" size="icon" className="h-7 w-7" asChild>
                                                        <a href={att.url} target="_blank" rel="noopener noreferrer">
                                                            <Eye size={14}/>
                                                        </a>
                                                    </Button>
                                                ))}
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => {
                                                    const updatedUsage = investor.fundUsage?.filter(u => u.id !== usage.id);
                                                    updateInvestor(investor.id, { fundUsage: updatedUsage });
                                                }}>
                                                    <Trash2 size={14}/>
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {(!investor.fundUsage || investor.fundUsage.length === 0) && (
                                    <tr>
                                        <td colSpan={4} className="p-12 text-center text-muted-foreground italic">No se ha registrado el uso de este capital todavía.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </ScrollArea>
                </div>
            </TabsContent>

            <DialogFooter className="pt-6 border-t flex justify-between items-center mt-6">
                <div className="flex items-center gap-4">
                    <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button type="button" variant="destructive" size="sm">
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
                </div>
                <div className="flex gap-2">
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Check className="mr-2 h-4 w-4"/> Guardar Cambios Generales
                    </Button>
                </div>
            </DialogFooter>
            </form>
            </Form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
