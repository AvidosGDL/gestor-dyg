'use client';

import React, { useState, useMemo } from 'react';
import { useBanks } from '@/contexts/banks-context';
import { BankAccount } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Landmark, Loader2, Edit, Search, MoreVertical, Trash2, LayoutGrid, List, FileSpreadsheet, FileText, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import BankDetailView from './bank-detail-view';
import EditBankDialog from './edit-bank-dialog';
import { Input } from '../ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import * as XLSX from 'xlsx';
import BanksReportDialog from './banks-report-dialog';

function BankAccountCard({ bankAccount, onSelect, onEdit, onDelete }: { bankAccount: BankAccount, onSelect: (id: string) => void, onEdit: (account: BankAccount) => void, onDelete: (id: string) => void }) {
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const identifier = bankAccount.accountNumber || bankAccount.cardNumber || bankAccount.clabe || '';
  const displayIdentifier = identifier ? `...${identifier.slice(-4)}` : 'Sin número';

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex-1 space-y-1.5 cursor-pointer" onClick={() => onSelect(bankAccount.id)}>
          <CardTitle className="text-base truncate">{bankAccount.companyName}</CardTitle>
          <CardDescription className="flex items-center gap-2 pt-1 text-xs">
              {bankAccount.logoUrl ? <img src={bankAccount.logoUrl} alt={bankAccount.bankName} className="h-4 w-4 object-contain" /> : <Landmark size={12} />}
              {bankAccount.bankName} | {displayIdentifier}
          </CardDescription>
        </div>
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                    <MoreVertical className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(bankAccount)}>
                    <Edit className="mr-2 h-4 w-4" />
                    <span>Editar</span>
                </DropdownMenuItem>
                <AlertDialog onOpenChange={() => setDeleteConfirmation('')}>
                    <AlertDialogTrigger asChild>
                        <DropdownMenuItem onSelect={(e) => {e.preventDefault()}} className="text-destructive focus:text-destructive">
                             <Trash2 className="mr-2 h-4 w-4" />
                             <span>Eliminar</span>
                        </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. Esto eliminará permanentemente la cuenta. Para confirmar, escribe <strong className="text-foreground">ELIMINAR</strong>.
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                         <Input
                            id="delete-confirm-bank"
                            placeholder='Escribe "ELIMINAR"'
                            value={deleteConfirmation}
                            onChange={(e) => setDeleteConfirmation(e.target.value)}
                            autoComplete="off"
                        />
                        <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => onDelete(bankAccount.id)}
                            disabled={deleteConfirmation !== 'ELIMINAR'}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            Confirmar Eliminación
                        </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between">
        <div>
            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Saldo Actual</p>
            <p className="text-xl font-bold">${(Number(bankAccount.currentBalance) || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
        </div>
        <Button variant="outline" size="sm" className="w-full mt-4" onClick={() => onSelect(bankAccount.id)}>
          Ver Transacciones
        </Button>
      </CardContent>
    </Card>
  );
}


export default function BanksView() {
  const { bankAccounts, loading, deleteBankAccount } = useBanks();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof BankAccount | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });

  const filteredBankAccounts = useMemo(() => {
    if (!bankAccounts) return [];
    return bankAccounts.filter(account =>
      (account.companyName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (account.bankName || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [bankAccounts, searchTerm]);

  const totalBalance = useMemo(() => {
    return filteredBankAccounts.reduce((sum, acc) => sum + (acc.currentBalance || 0), 0);
  }, [filteredBankAccounts]);

  const sortedBankAccounts = useMemo(() => {
    if (!sortConfig.key) return filteredBankAccounts;
    return [...filteredBankAccounts].sort((a, b) => {
        const valA = a[sortConfig.key!] || 0;
        const valB = b[sortConfig.key!] || 0;
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
  }, [filteredBankAccounts, sortConfig]);

  const handleSort = (key: keyof BankAccount) => {
    setSortConfig(prev => ({
        key,
        direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const exportToExcel = () => {
    const data = sortedBankAccounts.map(acc => ({
        'Empresa': acc.companyName,
        'Banco': acc.bankName,
        'Número de Cuenta': acc.accountNumber || '',
        'CLABE': acc.clabe || '',
        'Tarjeta': acc.cardNumber || '',
        'Saldo Inicial': acc.initialBalance,
        'Fecha Saldo': acc.balanceDate,
        'Saldo Actual': acc.currentBalance
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Saldos Bancarios");
    XLSX.writeFile(workbook, `Gestor_Saldos_Bancarios_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const selectedAccount = useMemo(() => {
    if (!selectedAccountId) return null;
    return bankAccounts.find(acc => acc.id === selectedAccountId);
  }, [selectedAccountId, bankAccounts]);


  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (selectedAccount) {
    return <BankDetailView bankAccount={selectedAccount} onBack={() => setSelectedAccountId(null)} />;
  }

  return (
    <>
    <div className="h-full flex flex-col space-y-6 p-2">
        {/* Resumen Superior */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-primary text-primary-foreground shadow-md">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium opacity-80 uppercase tracking-wider mb-1">Saldo Total en Bancos</p>
                            <p className="text-3xl font-bold">${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        <Landmark size={40} className="opacity-20" />
                    </div>
                </CardContent>
            </Card>
            <div className="md:col-span-2 flex flex-col justify-end gap-2">
                <div className="flex items-center justify-between gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por empresa o banco..."
                            className="pl-9 h-11"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-1 bg-muted p-1 rounded-lg border">
                        <Button 
                            variant={viewMode === 'cards' ? 'secondary' : 'ghost'} 
                            size="icon" 
                            onClick={() => setViewMode('cards')}
                            className="h-9 w-9"
                        >
                            <LayoutGrid size={18} />
                        </Button>
                        <Button 
                            variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                            size="icon" 
                            onClick={() => setViewMode('list')}
                            className="h-9 w-9"
                        >
                            <List size={18} />
                        </Button>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 gap-2" onClick={exportToExcel}>
                        <FileSpreadsheet size={16} /> Exportar Excel
                    </Button>
                    <Button variant="outline" className="flex-1 gap-2" onClick={() => setIsReportDialogOpen(true)}>
                        <FileText size={16} /> Reporte PDF con Movimientos
                    </Button>
                </div>
            </div>
        </div>

        {sortedBankAccounts.length > 0 ? (
             <ScrollArea className="flex-1">
                {viewMode === 'cards' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-1">
                        {sortedBankAccounts.map(account => (
                        <BankAccountCard 
                            key={account.id} 
                            bankAccount={account} 
                            onSelect={setSelectedAccountId}
                            onEdit={setEditingAccount}
                            onDelete={deleteBankAccount}
                        />
                        ))}
                    </div>
                ) : (
                    <div className="border rounded-xl bg-card overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="cursor-pointer hover:bg-muted" onClick={() => handleSort('companyName')}>
                                        <div className="flex items-center gap-2">Empresa <ArrowUpDown size={14}/></div>
                                    </TableHead>
                                    <TableHead className="cursor-pointer hover:bg-muted" onClick={() => handleSort('bankName')}>
                                        <div className="flex items-center gap-2">Banco <ArrowUpDown size={14}/></div>
                                    </TableHead>
                                    <TableHead>Identificador</TableHead>
                                    <TableHead className="text-right cursor-pointer hover:bg-muted" onClick={() => handleSort('currentBalance')}>
                                        <div className="flex items-center justify-end gap-2">Saldo Actual <ArrowUpDown size={14}/></div>
                                    </TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedBankAccounts.map(account => {
                                    const identifier = account.accountNumber || account.cardNumber || account.clabe || '';
                                    const displayIdentifier = identifier ? `...${identifier.slice(-4)}` : 'N/A';
                                    return (
                                        <TableRow key={account.id} className="cursor-pointer" onClick={() => setSelectedAccountId(account.id)}>
                                            <TableCell className="font-bold">{account.companyName}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {account.logoUrl && <img src={account.logoUrl} className="h-4 w-4 object-contain"/>}
                                                    {account.bankName}
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">{displayIdentifier}</TableCell>
                                            <TableCell className="text-right font-bold text-base">
                                                ${account.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </TableCell>
                                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex justify-end gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => setEditingAccount(account)}><Edit size={14}/></Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </ScrollArea>
        ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                <Landmark size={48} className="mb-4" />
                <h3 className="text-lg font-semibold">
                    {searchTerm ? 'No se encontraron cuentas' : 'No hay cuentas bancarias registradas'}
                </h3>
                <p className="text-sm">
                    {searchTerm ? 'Intenta con otra búsqueda.' : 'Haz clic en "Nueva Cuenta" para empezar.'}
                </p>
            </div>
        )}
    </div>
    {editingAccount && (
        <EditBankDialog
            isOpen={!!editingAccount}
            onOpenChange={(isOpen) => { if (!isOpen) setEditingAccount(null) }}
            bankAccount={editingAccount}
        />
    )}
    <BanksReportDialog 
        isOpen={isReportDialogOpen}
        onOpenChange={setIsReportDialogOpen}
        bankAccounts={bankAccounts || []}
    />
    </>
  );
}
