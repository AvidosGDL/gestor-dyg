'use client';

import React, { useState, useMemo } from 'react';
import { useBanks } from '@/contexts/banks-context';
import type { BankAccount, BankTransaction } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, Upload, Loader2, Trash2, FileCheck2, User, Info, Scale, Edit, Search, Filter, X, Tag, ExternalLink, Copy, Check } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { format, isWithinInterval, startOfDay, endOfDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import NewBankTransactionDialog from './new-bank-transaction-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import ImportBankTransactionsDialog from './import-bank-transactions-dialog';
import ConciliateStatementDialog from './conciliate-statement-dialog';
import ReconcileBalanceDialog from './reconcile-balance-dialog';
import EditBankDialog from './edit-bank-dialog';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import EditBankTransactionDialog from './edit-bank-transaction-dialog';
import { useToast } from '@/hooks/use-toast';
import { Label } from '../ui/label';


export default function BankDetailView({ bankAccount, onBack }: { bankAccount: BankAccount, onBack: () => void }) {
  const firestore = useFirestore();
  const { deleteBankTransaction } = useBanks();
  const { toast } = useToast();
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isConciliateOpen, setIsConciliateOpen] = useState(false);
  const [isReconcileBalanceOpen, setIsReconcileBalanceOpen] = useState(false);
  const [isEditBankOpen, setIsEditBankOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<BankTransaction | null>(null);
  const [copied, setCopied] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'ingreso' | 'egreso'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  const transactionsPath = useMemo(() => `banks/${bankAccount.id}/transactions`, [bankAccount.id]);
  const transactionsRef = useMemoFirebase(() => collection(firestore, transactionsPath), [firestore, transactionsPath]);
  const transactionsQuery = useMemoFirebase(() => query(transactionsRef, orderBy('date', 'desc')), [transactionsRef]);
  const { data: transactions, loading: transactionsLoading } = useCollection<BankTransaction>(transactionsQuery);

  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(tx => {
        const matchesSearch = tx.description.toLowerCase().includes(search.toLowerCase()) || 
                             (tx.categories?.some(c => c.toLowerCase().includes(search.toLowerCase())));
        const matchesType = typeFilter === 'all' || tx.type === typeFilter;
        const matchesUser = tx.createdBy?.toLowerCase().includes(userSearch.toLowerCase());
        
        const txDate = new Date(tx.date);
        const matchesDate = (!startDate || txDate >= startOfDay(new Date(startDate + 'T00:00:00'))) &&
                          (!endDate || txDate <= endOfDay(new Date(endDate + 'T23:59:59')));
                          
        const matchesAmount = (!minAmount || tx.amount >= Number(minAmount)) &&
                            (!maxAmount || tx.amount <= Number(maxAmount));

        return matchesSearch && matchesType && matchesUser && matchesDate && matchesAmount;
    });
  }, [transactions, search, typeFilter, startDate, endDate, userSearch, minAmount, maxAmount]);

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

  return (
    <>
      <div className="h-full flex flex-col p-2 space-y-4">
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
            {bankAccount.portalUrl && (
                <div className="flex items-center gap-4 bg-muted/50 p-2 px-4 rounded-xl border border-border">
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] uppercase font-bold text-muted-foreground">Acceso Directo</span>
                        <div className="flex items-center gap-3 mt-1">
                            {bankAccount.portalUser && (
                                <Button variant="secondary" size="sm" className="h-7 text-xs gap-1.5" onClick={() => copyToClipboard(bankAccount.portalUser!)}>
                                    {copied ? <Check size={12} className="text-emerald-500"/> : <Copy size={12}/>}
                                    <span className="font-mono">{bankAccount.portalUser}</span>
                                </Button>
                            )}
                            <Button size="sm" className="h-7 gap-2" asChild>
                                <a href={bankAccount.portalUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink size={14}/> Ir al Banco
                                </a>
                            </Button>
                        </div>
                    </div>
                </div>
            )}
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
              <p className="text-xs text-muted-foreground mt-1">Registrado el {bankAccount.balanceDate ? format(new Date(bankAccount.balanceDate + 'T12:00:00'), 'dd/MM/yyyy') : 'N/A'}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="flex-1 flex flex-col overflow-hidden">
            <CardHeader className="pb-2 shrink-0">
                <div className="flex flex-row items-center justify-between mb-4">
                    <div>
                        <CardTitle>Historial de Transacciones</CardTitle>
                        <CardDescription>Lista de ingresos y egresos de la cuenta.</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                            <Upload className="mr-2 h-4 w-4"/> Importar Comprobantes
                        </Button>
                        <Button onClick={() => setIsAddTransactionOpen(true)}>
                            <Plus className="mr-2 h-4 w-4"/> Agregar Transacción
                        </Button>
                    </div>
                </div>
                
                {/* Advanced Filters */}
                <div className="bg-muted/30 p-4 rounded-xl space-y-4 border border-border">
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Búsqueda / Categoría</Label>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Descripción o categoría..." className="pl-8 h-8 text-xs" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Tipo</Label>
                            <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos</SelectItem>
                                    <SelectItem value="ingreso">Ingresos</SelectItem>
                                    <SelectItem value="egreso">Egresos</SelectItem>
                                </SelectContent>
                            </Select>
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
                        <div className="text-xs text-muted-foreground font-medium">
                            Mostrando {filteredTransactions.length} de {transactions?.length || 0} movimientos
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden pt-4">
                <div className="border rounded-lg h-full overflow-y-auto">
                <Table>
                    <TableHeader className="sticky top-0 bg-muted z-10 shadow-sm">
                        <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Descripción / Categorías</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                            <TableHead>Usuario</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {transactionsLoading && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center p-8">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                </TableCell>
                            </TableRow>
                        )}
                        {!transactionsLoading && filteredTransactions.map(tx => (
                            <TableRow key={tx.id}>
                                <TableCell className="whitespace-nowrap">{format(new Date(tx.date), 'dd/MM/yyyy')}</TableCell>
                                <TableCell>
                                    <div className="space-y-1">
                                        <div className="font-medium">{tx.description}</div>
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
                                    <span className={`font-semibold ${tx.type === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {tx.type === 'ingreso' ? 'Ingreso' : 'Egreso'}
                                    </span>
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold">${(tx.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <User size={10} />
                                        <span className="truncate max-w-[80px]">{tx.createdBy || 'Desconocido'}</span>
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => setEditingTransaction(tx)}>
                                            <Edit size={14} />
                                        </Button>
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
                                                        Esta acción eliminará la transacción permanentemente y reajustará el saldo de la cuenta.
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
                        ))}
                         {!transactionsLoading && filteredTransactions.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                                    {transactions?.length === 0 ? 'No hay transacciones registradas.' : 'No se encontraron movimientos con los filtros aplicados.'}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
                </div>
            </CardContent>
        </Card>

        <Card className="shrink-0">
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
       <ConciliateStatementDialog
        isOpen={isConciliateOpen}
        onOpenChange={setIsConciliateOpen}
        bankAccount={bankAccount}
        existingTransactions={transactions || []}
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
