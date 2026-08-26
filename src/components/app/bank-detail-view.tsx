'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useBanks } from '@/contexts/banks-context';
import type { BankAccount, BankTransaction, Attachment } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, Upload, Loader2, Trash2, FileCheck2, User, Info, Scale, Edit, Search, Filter, X, Tag, ExternalLink, Copy, Check, ArrowUp, ArrowDown, ChevronUp, ChevronDown, FileSpreadsheet, AlertCircle, Lightbulb, Building2, FileText, History, CheckCircle2, Clock, CalendarClock, TrendingDown, TrendingUp } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import { format, startOfDay, endOfDay, isPast, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import NewBankTransactionDialog from './new-bank-transaction-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import ImportBankTransactionsDialog from './import-bank-transactions-dialog';
import ConciliateStatementDialog from './conciliate-statement-dialog';
import ReconcileBalanceDialog from './reconcile-balance-dialog';
import EditBankDialog from './edit-bank-dialog';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import EditBankTransactionDialog from './edit-bank-transaction-dialog';
import { useToast } from '@/hooks/use-toast';
import { Label } from '../ui/label';
import ImportBankExcelDialog from './import-bank-excel-dialog';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import NewTaskDialog from './new-task-dialog';
import { useTasks } from '@/contexts/tasks-context';


export default function BankDetailView({ bankAccount, onBack }: { bankAccount: BankAccount, onBack: () => void }) {
  const firestore = useFirestore();
  const { deleteBankTransaction, swapTransactions, clearTransactionHistory, validateBankTransaction } = useBanks();
  const { tasks } = useTasks();
  const { toast } = useToast();
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isImportExcelOpen, setIsImportExcelOpen] = useState(false);
  const [isConciliateOpen, setIsConciliateOpen] = useState(false);
  const [isReconcileBalanceOpen, setIsReconcileBalanceOpen] = useState(false);
  const [isEditBankOpen, setIsEditBankOpen] = useState(false);
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<BankTransaction | null>(null);
  const [validatingTransaction, setValidatingTransaction] = useState<BankTransaction | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const validationFileInputRef = useRef<HTMLInputElement>(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'ingreso' | 'egreso'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  const transactionsPath = useMemo(() => `banks/${bankAccount.id}/transactions`, [bankAccount.id]);
  const transactionsRef = useMemoFirebase(() => collection(firestore, transactionsPath), [firestore, transactionsPath]);
  
  const { data: rawTransactions, isLoading: transactionsLoading } = useCollection<BankTransaction>(transactionsRef);

  // Pending tasks (Scheduled Movements) linked to this bank
  const scheduledTasks = useMemo(() => {
    return tasks.filter(t => t.linkedBankAccountId === bankAccount.id && t.status !== 'completado')
      .sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime();
      });
  }, [tasks, bankAccount.id]);

  // Ordenamiento y filtrado en memoria (Cliente)
  const sortedAndFilteredTransactions = useMemo(() => {
    if (!rawTransactions) return [];
    
    // 1. Ordenamiento completo (Fecha Desc, luego sortOrder Desc)
    const sorted = [...rawTransactions].sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        
        if (dateB !== dateA) {
            return dateB - dateA;
        }
        // Si la fecha es igual, usamos el orden manual
        return (b.sortOrder || 0) - (a.sortOrder || 0);
    });

    // 2. Aplicar filtros del usuario
    return sorted.filter(tx => {
        const matchesSearch = tx.description.toLowerCase().includes(search.toLowerCase()) || 
                             (tx.entityName?.toLowerCase().includes(search.toLowerCase())) ||
                             (tx.invoiceReference?.toLowerCase().includes(search.toLowerCase())) ||
                             (tx.categories?.some(c => c.toLowerCase().includes(search.toLowerCase())));
        const matchesType = typeFilter === 'all' || tx.type === typeFilter;
        const matchesUser = (tx.createdBy || '').toLowerCase().includes(userSearch.toLowerCase());
        
        // Fix para filtros de fecha: Normalizamos a mediodía local para evitar desfases
        const txDate = new Date(tx.date.split('T')[0] + 'T12:00:00');
        const matchesDate = (!startDate || txDate >= startOfDay(new Date(startDate + 'T12:00:00'))) &&
                          (!endDate || txDate <= endOfDay(new Date(endDate + 'T12:00:00')));
                          
        const matchesAmount = (!minAmount || tx.amount >= Number(minAmount)) &&
                            (!maxAmount || tx.amount <= Number(maxAmount));

        return matchesSearch && matchesType && matchesUser && matchesDate && matchesAmount;
    });
  }, [rawTransactions, search, typeFilter, startDate, endDate, userSearch, minAmount, maxAmount]);

  const identifier = bankAccount.accountNumber || bankAccount.cardNumber || bankAccount.clabe || '';
  const displayIdentifier = identifier ? `...${identifier.slice(-4)}` : 'Sin número';

  const resetFilters = () => {
    setSearch('');
    setTypeFilter('all');
    setStartDate('');
    setEndDate('');
    setUserSearch('');
    setMinAmount('');
    setMaxAmount('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: 'Copiado', description: 'Usuario copiado al portapapeles.' });
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDateSafely = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    try {
      // Extraemos solo la parte de la fecha YYYY-MM-DD para evitar saltos de zona horaria por el offset UTC
      const datePart = dateStr.split('T')[0];
      const [year, month, day] = datePart.split('-');
      if (year && month && day) {
        return `${day}/${month}/${year}`;
      }
      return dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (isMoving) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= sortedAndFilteredTransactions.length) return;

    setIsMoving(true);
    await swapTransactions(bankAccount.id, sortedAndFilteredTransactions[index], sortedAndFilteredTransactions[targetIdx]);
    setIsMoving(false);
  };

  const handleDeleteHistory = async () => {
    try {
      await clearTransactionHistory(bankAccount.id);
      setDeleteConfirmText('');
    } catch (e) {}
  };

  const handleValidateClick = (tx: BankTransaction) => {
    setValidatingTransaction(tx);
    setTimeout(() => validationFileInputRef.current?.click(), 100);
  };

  const handleValidationFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !validatingTransaction) return;

    setIsValidating(true);
    toast({ title: 'Procesando validación...', description: 'Subiendo comprobante y actualizando saldos.' });

    try {
        const storage = getStorage();
        const fileRef = storageRef(storage, `bank_attachments/${bankAccount.id}/${validatingTransaction.id}/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(fileRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);

        const newAttachment: Attachment = {
            name: file.name,
            type: file.type,
            size: file.size,
            url: downloadURL,
        };

        await validateBankTransaction(bankAccount.id, validatingTransaction.id, [newAttachment]);
        setValidatingTransaction(null);
    } catch (error: any) {
        console.error("Error al validar:", error);
        toast({ variant: 'destructive', title: 'Error de validación', description: error.message });
    } finally {
        setIsValidating(false);
        if (validationFileInputRef.current) validationFileInputRef.current.value = '';
    }
  };

  const canReorder = search === '' && typeFilter === 'all' && startDate === '' && endDate === '' && userSearch === '' && minAmount === '' && maxAmount === '';

  return (
    <>
      <div className="h-full flex flex-col p-2 space-y-4 overflow-y-auto">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={onBack} className="h-8 w-8">
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h2 className="text-xl font-bold">{bankAccount.companyName}</h2>
                    <p className="text-sm text-muted-foreground">{bankAccount.bankName} | Terminación: {displayIdentifier}</p>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <AlertDialog onOpenChange={() => setDeleteConfirmText('')}>
                    <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-2 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                            <Trash2 size={14} /> Limpiar Historial
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>¿Limpiar todo el historial?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Esta acción eliminará permanentemente **todas** las transacciones de esta cuenta y restablecerá el saldo al valor inicial. Esta operación no se puede deshacer.
                                <br /><br />
                                Para confirmar, escribe <strong className="text-foreground uppercase">BORRAR</strong> a continuación:
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="py-4">
                            <Input 
                                value={deleteConfirmText} 
                                onChange={(e) => setDeleteConfirmText(e.target.value)} 
                                placeholder='Escribe "BORRAR"' 
                                className="uppercase"
                            />
                        </div>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction 
                                onClick={handleDeleteHistory}
                                disabled={deleteConfirmText !== 'BORRAR'}
                                className="bg-destructive hover:bg-destructive/90"
                            >
                                Confirmar Borrado Masivo
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {(bankAccount.portalUrl || bankAccount.portalPasswordTip) && (
                    <div className="flex items-center gap-4 bg-muted/50 p-2 px-4 rounded-xl border border-border">
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] uppercase font-bold text-muted-foreground">Acceso Directo</span>
                            <div className="flex items-center gap-3 mt-1">
                                {bankAccount.portalPasswordTip && (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Badge variant="outline" className="h-7 cursor-help border-amber-200 bg-amber-50 text-amber-700 flex gap-1.5 px-2">
                                                    <Lightbulb size={12}/>
                                                    <span className="text-[10px]">Tip Contraseña</span>
                                                </Badge>
                                            </TooltipTrigger>
                                            <TooltipContent className="bg-amber-50 text-amber-900 border-amber-200 max-w-[200px]">
                                                <p className="text-xs font-medium">{bankAccount.portalPasswordTip}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                )}
                                {bankAccount.portalUser && (
                                    <Button variant="secondary" size="sm" className="h-7 text-xs gap-1.5" onClick={() => copyToClipboard(bankAccount.portalUser!)}>
                                        {copied ? <Check size={12} className="text-emerald-500"/> : <Copy size={12}/>}
                                        <span className="font-mono">{bankAccount.portalUser}</span>
                                    </Button>
                                )}
                                {bankAccount.portalUrl && (
                                    <Button size="sm" className="h-7 gap-2" asChild>
                                        <a href={bankAccount.portalUrl} target="_blank" rel="noopener noreferrer">
                                            <ExternalLink size={14}/> Ir al Banco
                                        </a>
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
                Saldo Actual
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => setIsReconcileBalanceOpen(true)}>
                   <Scale size={14} /> Conciliar Manual
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">${(bankAccount.currentBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-500"/> Este saldo solo incluye transacciones validadas.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
                <div className="flex items-center gap-2"><Info size={14} /> Saldo Inicial</div>
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => setIsEditBankOpen(true)}>
                   <Edit size={14} /> Editar
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">${(bankAccount.initialBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-xs text-muted-foreground mt-1">Registrado el {bankAccount.balanceDate ? formatDateSafely(bankAccount.balanceDate) : 'N/A'}</p>
            </CardContent>
          </Card>
        </div>

        {/* Sección de Movimientos Programados (Shared Visibility from Tasks) */}
        {scheduledTasks.length > 0 && (
          <Card className="border-blue-200 bg-blue-50/10">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2 text-blue-800">
                            <CalendarClock size={18} />
                            Movimientos Programados (Pendientes)
                        </CardTitle>
                        <CardDescription className="text-xs text-blue-600/70">Tareas vinculadas a esta cuenta que aún no se han completado.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-2">
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-blue-200">
                    {scheduledTasks.map(task => {
                        const isOverdue = task.dueDate && isPast(parseISO(task.dueDate)) && format(parseISO(task.dueDate), 'yyyy-MM-dd') !== format(new Date(), 'yyyy-MM-dd');
                        return (
                            <div key={task.id} className="min-w-[280px] bg-white border border-blue-100 rounded-xl p-3 shadow-sm flex flex-col justify-between">
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <Badge variant={task.financialMovementType === 'ingreso' ? 'outline' : 'secondary'} className={cn(
                                            "text-[9px] uppercase font-bold",
                                            task.financialMovementType === 'ingreso' ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "bg-rose-50 text-rose-700 border-rose-200"
                                        )}>
                                            {task.financialMovementType === 'ingreso' ? <TrendingUp size={10} className="mr-1"/> : <TrendingDown size={10} className="mr-1"/>}
                                            {task.financialMovementType === 'ingreso' ? 'Cobro' : 'Pago'}
                                        </Badge>
                                        {task.dueDate && (
                                            <span className={cn("text-[10px] font-bold", isOverdue ? "text-rose-600" : "text-muted-foreground")}>
                                                {formatDateSafely(task.dueDate)}
                                            </span>
                                        )}
                                    </div>
                                    <h4 className="text-xs font-bold text-slate-800 line-clamp-2 mb-1">{task.title}</h4>
                                    <p className="text-[10px] text-muted-foreground font-medium">{task.client || 'Sin Empresa Rel.'}</p>
                                </div>
                                <div className="mt-4 flex items-center justify-between border-t border-blue-50 pt-2">
                                    <span className="font-mono font-bold text-sm text-blue-900">${task.value.toLocaleString('en-US')}</span>
                                    <Badge variant="outline" className="text-[9px] h-5 bg-slate-50">{task.status}</Badge>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
          </Card>
        )}

        <Card className="flex-1 flex flex-col overflow-hidden min-h-[500px]">
            <CardHeader className="pb-2 shrink-0">
                <div className="flex flex-row items-center justify-between mb-4">
                    <div>
                        <CardTitle>Historial de Transacciones</CardTitle>
                        <CardDescription>Lista de ingresos y egresos de la cuenta.</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setIsNewTaskOpen(true)} className="gap-2 border-primary text-primary hover:bg-primary/5">
                            <Clock className="h-4 w-4"/> Programar Pago Recurrente
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setIsImportExcelOpen(true)} className="gap-2">
                            <FileSpreadsheet className="h-4 w-4 text-emerald-600"/> Importar Excel
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setIsImportOpen(true)} className="gap-2">
                            <Upload className="h-4 w-4"/> Importar Comprobantes
                        </Button>
                        <Button size="sm" onClick={() => setIsAddTransactionOpen(true)} className="gap-2">
                            <Plus className="h-4 w-4"/> Agregar Transacción
                        </Button>
                    </div>
                </div>
                
                <div className="bg-muted/30 p-4 rounded-xl space-y-4 border border-border">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Búsqueda (Desc, Empresa, Factura)</Label>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Descripción, empresa o factura..." className="pl-8 h-8 text-xs" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Tipo</Label>
                            <select 
                                value={typeFilter} 
                                onChange={e => setTypeFilter(e.target.value as any)}
                                className="w-full h-8 text-xs bg-background border rounded-md px-2 focus:ring-1 focus:ring-primary outline-none"
                            >
                                <option value="all">Todos</option>
                                <option value="ingreso">Ingresos</option>
                                <option value="egreso">Egresos</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Rango de Fechas</Label>
                            <div className="flex gap-2">
                                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-[10px] p-1 px-2" />
                                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-8 text-[10px] p-1 px-2" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Usuario</Label>
                            <Input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Creado por..." className="h-8 text-xs" />
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex gap-4 items-center">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Montos ($)</Label>
                                <div className="flex items-center gap-2">
                                    <Input type="number" value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="Mín" className="h-8 w-20 text-xs" />
                                    <span className="text-muted-foreground">-</span>
                                    <Input type="number" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} placeholder="Máx" className="h-8 w-20 text-xs" />
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-[10px] gap-1 self-end">
                                <X size={14}/> Limpiar Filtros
                            </Button>
                        </div>
                        <div className="text-xs text-muted-foreground font-medium flex items-center gap-4">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500" />
                                <span className="text-[10px]">Ajuste Pendiente / En Proceso</span>
                            </div>
                            <span>Mostrando {sortedAndFilteredTransactions.length} de {rawTransactions?.length || 0} movimientos</span>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden pt-4 pb-12">
                <div className="border rounded-lg h-full overflow-y-auto">
                <Table>
                    <TableHeader className="sticky top-0 bg-muted z-10 shadow-sm">
                        <TableRow>
                            {canReorder && <TableHead className="w-10"></TableHead>}
                            <TableHead>Fecha</TableHead>
                            <TableHead>Descripción / Estatus</TableHead>
                            <TableHead>Empresa Rel.</TableHead>
                            <TableHead>Factura / Ref.</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                            <TableHead>Usuario</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {transactionsLoading && (
                            <TableRow>
                                <TableCell colSpan={canReorder ? 9 : 8} className="text-center p-8">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                </TableCell>
                            </TableRow>
                        )}
                        {!transactionsLoading && sortedAndFilteredTransactions.map((tx, idx) => {
                            const isPending = tx.validationStatus === 'pending';
                            return (
                            <TableRow 
                                key={tx.id} 
                                className={cn(
                                    "group transition-colors", 
                                    tx.isAdjustment ? "bg-amber-500/5 hover:bg-amber-500/10 border-l-4 border-l-amber-500" : "",
                                    isPending ? "bg-blue-500/5 hover:bg-blue-500/10 opacity-80" : ""
                                )}
                            >
                                {canReorder && (
                                    <TableCell className="p-0 text-center">
                                        <div className="flex flex-col items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-5 w-5 hover:bg-muted" 
                                                disabled={idx === 0 || isMoving}
                                                onClick={() => handleMove(idx, 'up')}
                                            >
                                                <ChevronUp size={14} />
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-5 w-5 hover:bg-muted" 
                                                disabled={idx === sortedAndFilteredTransactions.length - 1 || isMoving}
                                                onClick={() => handleMove(idx, 'down')}
                                            >
                                                <ChevronDown size={14} />
                                            </Button>
                                        </div>
                                    </TableCell>
                                )}
                                <TableCell className="whitespace-nowrap">{formatDateSafely(tx.date)}</TableCell>
                                <TableCell>
                                    <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-medium text-sm">{tx.description}</span>
                                            {isPending && (
                                                <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300 text-[9px] h-4 py-0 flex gap-1 items-center animate-pulse">
                                                    <Clock size={10} /> En Proceso
                                                </Badge>
                                            )}
                                            {tx.isAdjustment && (
                                                <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[9px] h-4 py-0 flex gap-1 items-center">
                                                    <AlertCircle size={10} /> Ajuste Manual
                                                </Badge>
                                            )}
                                        </div>
                                        {tx.categories && tx.categories.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {tx.categories.map(cat => (
                                                    <Badge key={cat} variant="secondary" className="text-[9px] px-1.5 h-4 flex items-center gap-1">
                                                        <Tag size={8}/> {cat}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {tx.entityName ? (
                                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/40 p-1 px-2 rounded-md border border-border/40 w-fit">
                                            <Building2 size={12} />
                                            <span className="truncate max-w-[120px]">{tx.entityName}</span>
                                        </div>
                                    ) : '-'}
                                </TableCell>
                                <TableCell>
                                    {tx.invoiceReference ? (
                                        <div className="flex items-center gap-1.5 text-[11px] text-primary/80 bg-primary/5 p-1 px-2 rounded-md border border-primary/10 w-fit">
                                            <FileText size={12} />
                                            <span className="truncate max-w-[100px] font-mono font-medium">{tx.invoiceReference}</span>
                                        </div>
                                    ) : '-'}
                                </TableCell>
                                <TableCell>
                                    <span className={`text-xs font-semibold ${tx.type === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {tx.type === 'ingreso' ? 'Ingreso' : 'Egreso'}
                                    </span>
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold text-sm">
                                    ${(tx.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <User size={10} />
                                        <span className="truncate max-w-[80px]">{tx.createdBy || 'Desconocido'}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                        {isPending ? (
                                            <Button 
                                                variant="default" 
                                                size="sm" 
                                                className="h-7 text-[10px] px-2 gap-1.5 bg-blue-600 hover:bg-blue-700"
                                                onClick={() => handleValidateClick(tx)}
                                                disabled={isValidating}
                                            >
                                                {isValidating && validatingTransaction?.id === tx.id ? <Loader2 size={10} className="animate-spin"/> : <Upload size={10} />}
                                                Validar
                                            </Button>
                                        ) : (
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => setEditingTransaction(tx)}>
                                                <Edit size={14} />
                                            </Button>
                                        )}
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                                                    <Trash2 size={14} />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Esta acción eliminará la transacción permanentemente.
                                                        {!isPending && " El saldo de la cuenta se reajustará automáticamente."}
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        className="bg-destructive hover:bg-destructive/90"
                                                        onClick={() => deleteBankTransaction(bankAccount.id, tx)}
                                                    >
                                                        Eliminar
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )})}
                         {!transactionsLoading && sortedAndFilteredTransactions.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={canReorder ? 9 : 8} className="text-center h-24 text-muted-foreground">
                                    {rawTransactions?.length === 0 ? 'No hay transacciones registradas.' : 'No se encontraron movimientos con los filtros aplicados.'}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
                </div>
            </CardContent>
        </Card>

        {/* Input oculto para validación rápida */}
        <input 
            type="file" 
            ref={validationFileInputRef} 
            className="hidden" 
            accept="image/*,.pdf" 
            onChange={handleValidationFileChange}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0 pb-12">
            <Card>
                <CardHeader className="py-4">
                    <CardTitle className="text-base">Conciliación Bancaria con IA</CardTitle>
                    <CardDescription className="text-xs">
                        Sube tu estado de cuenta mensual en PDF para compararlo con las transacciones registradas y encontrar discrepancias.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pb-4">
                    <Button size="sm" onClick={() => setIsConciliateOpen(true)}>
                        <FileCheck2 className="mr-2 h-4 w-4"/> Iniciar Conciliación
                    </Button>
                </CardContent>
            </Card>

            <Card className="bg-muted/10">
                <CardHeader className="py-4">
                    <CardTitle className="text-base flex items-center gap-2">
                        <History size={16} /> Auditoría de Limpieza
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Último borrado masivo de historial realizado en esta cuenta.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pb-4">
                    {bankAccount.lastHistoryDeletion ? (
                        <div className="space-y-1 text-xs">
                            <p className="font-semibold text-rose-600 flex items-center gap-1.5">
                                <AlertCircle size={14} /> Historial limpiado por seguridad
                            </p>
                            <p className="text-muted-foreground">
                                <strong>Fecha:</strong> {format(new Date(bankAccount.lastHistoryDeletion.deletedAt), "PPP 'a las' HH:mm", { locale: es })}
                            </p>
                            <p className="text-muted-foreground">
                                <strong>Usuario:</strong> {bankAccount.lastHistoryDeletion.deletedBy}
                            </p>
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground italic">No se han realizado borrados masivos recientemente.</p>
                    )}
                </CardContent>
            </Card>
        </div>
      </div>

      <NewBankTransactionDialog
        isOpen={isAddTransactionOpen}
        onOpenChange={setIsAddTransactionOpen}
        bankAccountId={bankAccount.id}
       />
      <ImportBankTransactionsDialog
        isOpen={isImportOpen}
        onOpenChange={setIsImportOpen}
        bankAccountId={bankAccount.id}
       />
       <ImportBankExcelDialog
        isOpen={isImportExcelOpen}
        onOpenChange={setIsImportExcelOpen}
        bankAccountId={bankAccount.id}
       />
       <ConciliateStatementDialog
        isOpen={isConciliateOpen}
        onOpenChange={setIsConciliateOpen}
        bankAccount={bankAccount}
        existingTransactions={rawTransactions || []}
       />
       <ReconcileBalanceDialog
        isOpen={isReconcileBalanceOpen}
        onOpenChange={setIsReconcileBalanceOpen}
        bankAccount={bankAccount}
       />
       <EditBankDialog
        isOpen={isEditBankOpen}
        onOpenChange={setIsEditBankOpen}
        bankAccount={bankAccount}
       />
       {isNewTaskOpen && (
           <NewTaskDialog
               open={isNewTaskOpen}
               onOpenChange={setIsNewTaskOpen}
               defaultLinkedBankId={bankAccount.id}
           />
       )}
       {editingTransaction && (
           <EditBankTransactionDialog 
                isOpen={!!editingTransaction}
                onOpenChange={(open) => !open && setEditingTransaction(null)}
                bankAccountId={bankAccount.id}
                transaction={editingTransaction}
           />
       )}
    </>
  );
}
