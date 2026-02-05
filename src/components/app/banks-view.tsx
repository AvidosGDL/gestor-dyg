
'use client';

import React, { useState, useMemo } from 'react';
import { useBanks } from '@/contexts/banks-context';
import { BankAccount } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Landmark, Loader2, Edit, Search, MoreVertical, Trash2 } from 'lucide-react';
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

function BankAccountCard({ bankAccount, onSelect, onEdit, onDelete }: { bankAccount: BankAccount, onSelect: (id: string) => void, onEdit: (account: BankAccount) => void, onDelete: (id: string) => void }) {
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const identifier = bankAccount.accountNumber || bankAccount.cardNumber || bankAccount.clabe || '';
  const displayIdentifier = identifier ? `...${identifier.slice(-4)}` : 'Sin número';

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex-1 space-y-1.5 cursor-pointer" onClick={() => onSelect(bankAccount.id)}>
          <CardTitle>{bankAccount.companyName}</CardTitle>
          <CardDescription className="flex items-center gap-2 pt-1">
              {bankAccount.logoUrl ? <img src={bankAccount.logoUrl} alt={bankAccount.bankName} className="h-5 w-5 object-contain" /> : <Landmark size={14} />}
              {bankAccount.bankName} | Term: {displayIdentifier}
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
            <p className="text-xs text-muted-foreground">Saldo Actual</p>
            <p className="text-2xl font-bold">${(bankAccount.currentBalance || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
        </div>
        <Button variant="outline" className="w-full mt-4" onClick={() => onSelect(bankAccount.id)}>
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

  const filteredBankAccounts = useMemo(() => {
    if (!bankAccounts) return [];
    return bankAccounts.filter(account =>
      (account.companyName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (account.bankName || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [bankAccounts, searchTerm]);

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
    <div className="h-full flex flex-col space-y-4 p-2">
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                placeholder="Buscar por empresa o banco..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>

        {filteredBankAccounts.length > 0 ? (
             <ScrollArea className="flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-1">
                    {filteredBankAccounts.map(account => (
                      <BankAccountCard 
                        key={account.id} 
                        bankAccount={account} 
                        onSelect={setSelectedAccountId}
                        onEdit={setEditingAccount}
                        onDelete={deleteBankAccount}
                      />
                    ))}
                </div>
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
    </>
  );
}
