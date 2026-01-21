
'use client';

import React, { useState, useMemo } from 'react';
import { useBanks } from '@/contexts/banks-context';
import type { BankAccount, BankTransaction } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, Upload, Loader2, Trash2, FileCheck2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import NewBankTransactionDialog from './new-bank-transaction-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import ImportBankTransactionsDialog from './import-bank-transactions-dialog';
import ConciliateStatementDialog from './conciliate-statement-dialog';


export default function BankDetailView({ bankAccount, onBack }: { bankAccount: BankAccount, onBack: () => void }) {
  const firestore = useFirestore();
  const { deleteBankTransaction } = useBanks();
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isConciliateOpen, setIsConciliateOpen] = useState(false);

  const transactionsPath = useMemo(() => `banks/${bankAccount.id}/transactions`, [bankAccount.id]);
  const transactionsRef = useMemoFirebase(() => collection(firestore, transactionsPath), [firestore, transactionsPath]);
  const transactionsQuery = useMemoFirebase(() => query(transactionsRef, orderBy('date', 'desc')), [transactionsRef]);
  const { data: transactions, loading: transactionsLoading } = useCollection<BankTransaction>(transactionsQuery);

  return (
    <>
      <div className="h-full flex flex-col p-2 space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={onBack} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">{bankAccount.companyName}</h2>
            <p className="text-sm text-muted-foreground">{bankAccount.bankName} | Terminación: ...{bankAccount.accountNumber.slice(-4)}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Saldo Actual</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">${bankAccount.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>

        <Card className="flex-1 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
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
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden">
                <div className="border rounded-lg h-full overflow-y-auto">
                <Table>
                    <TableHeader className="sticky top-0 bg-muted z-10">
                        <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Descripción</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {transactionsLoading && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center p-8">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                </TableCell>
                            </TableRow>
                        )}
                        {!transactionsLoading && transactions?.map(tx => (
                            <TableRow key={tx.id}>
                                <TableCell>{format(new Date(tx.date), 'dd/MM/yyyy')}</TableCell>
                                <TableCell>{tx.description}</TableCell>
                                <TableCell>
                                    <span className={`font-semibold ${tx.type === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {tx.type === 'ingreso' ? 'Ingreso' : 'Egreso'}
                                    </span>
                                </TableCell>
                                <TableCell className="text-right font-mono">${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-right">
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
                                </TableCell>
                            </TableRow>
                        ))}
                         {!transactionsLoading && (!transactions || transactions.length === 0) && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                                    No hay transacciones registradas.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
                </div>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Conciliación Bancaria con IA</CardTitle>
                <CardDescription>
                    Sube tu estado de cuenta mensual en PDF para compararlo con las transacciones registradas y encontrar discrepancias.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button onClick={() => setIsConciliateOpen(true)}>
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
    </>
  );
}
