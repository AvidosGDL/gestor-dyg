
'use client';

import React, { useState, useMemo } from 'react';
import { useBanks } from '@/contexts/banks-context';
import { BankAccount } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Landmark, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import BankDetailView from './bank-detail-view';

function BankAccountCard({ bankAccount, onSelect }: { bankAccount: BankAccount, onSelect: (id: string) => void }) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>{bankAccount.companyName}</CardTitle>
            <CardDescription className="flex items-center gap-2 pt-1">
                {bankAccount.logoUrl ? <img src={bankAccount.logoUrl} alt={bankAccount.bankName} className="h-5 w-5 object-contain" /> : <Landmark size={14} />}
                {bankAccount.bankName} | Terminación: ...{bankAccount.accountNumber.slice(-4)}
            </CardDescription>
          </div>
        </div>
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
  const { bankAccounts, loading } = useBanks();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

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
    <div className="h-full space-y-6 overflow-y-auto p-2">
        {bankAccounts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {bankAccounts.map(account => (
                  <BankAccountCard key={account.id} bankAccount={account} onSelect={setSelectedAccountId} />
                ))}
            </div>
        ) : (
            <div className="flex flex-col items-center justify-center h-60 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                <Landmark size={48} className="mb-4" />
                <h3 className="text-lg font-semibold">No hay cuentas bancarias registradas</h3>
                <p className="text-sm">Haz clic en "Nueva Cuenta" para empezar.</p>
            </div>
        )}
    </div>
    </>
  );
}
