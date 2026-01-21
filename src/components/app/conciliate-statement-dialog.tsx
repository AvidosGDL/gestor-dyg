'use client';

import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { FileUp, Loader2, Sparkles, X, Plus, AlertTriangle, FileWarning, Check } from 'lucide-react';
import { conciliateStatement, type ConciliationOutput } from '@/ai/flows/conciliate-bank-statement-flow';
import { useBanks } from '@/contexts/banks-context';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Checkbox } from '../ui/checkbox';
import type { BankAccount, BankTransaction } from '@/lib/types';
import { ScrollArea } from '../ui/scroll-area';
import { format } from 'date-fns';

type Step = 'upload' | 'processing' | 'review';

interface UnmatchedTransaction {
    id: string;
    date: string;
    description: string;
    amount: number;
    type: 'ingreso' | 'egreso';
}

interface ConciliateStatementDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  bankAccount: BankAccount;
  existingTransactions: BankTransaction[];
}

export default function ConciliateStatementDialog({ isOpen, onOpenChange, bankAccount, existingTransactions }: ConciliateStatementDialogProps) {
  const { toast } = useToast();
  const { batchAddConciliatedTransactions } = useBanks();

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [conciliationResult, setConciliationResult] = useState<ConciliationOutput | null>(null);
  const [selectedTxs, setSelectedTxs] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setStep('upload');
    setFile(null);
    setConciliationResult(null);
    setSelectedTxs([]);
    onOpenChange(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      if (e.target.files[0].type !== 'application/pdf') {
        toast({ variant: 'destructive', title: 'Archivo no válido', description: 'Por favor, sube un archivo PDF.' });
        return;
      }
      setFile(e.target.files[0]);
    }
  };

  const handleConciliate = async () => {
    if (!file) {
      toast({ variant: 'destructive', title: 'No hay archivo', description: 'Por favor, selecciona un estado de cuenta en PDF.' });
      return;
    }
    setStep('processing');
    toast({ title: 'Procesando estado de cuenta...', description: 'La IA está analizando el documento. Esto puede tardar un momento.' });

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async (e) => {
        const dataUri = e.target?.result as string;
        const result = await conciliateStatement({
          statementPdfUri: dataUri,
          existingTransactions: existingTransactions,
        });
        
        const unmatchedWithIds = result.unmatchedTransactions.map(tx => ({...tx, id: crypto.randomUUID()}));

        setConciliationResult({
            ...result,
            unmatchedTransactions: unmatchedWithIds
        });
        setSelectedTxs(unmatchedWithIds.map(tx => tx.id));
        setStep('review');
        toast({ title: 'Conciliación Completa', description: 'Revisa los resultados encontrados por la IA.' });
      };
      reader.onerror = (e) => {
        throw new Error("No se pudo leer el archivo.");
      }
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error de IA', description: 'No se pudo procesar el estado de cuenta.' });
      setStep('upload');
    }
  };
  
  const handleImport = async () => {
    if (!conciliationResult || selectedTxs.length === 0) {
        toast({ variant: 'destructive', title: 'Nada que importar', description: 'No hay transacciones seleccionadas para agregar.' });
        return;
    }
    setStep('processing');
    toast({ title: 'Importando transacciones...' });

    try {
      const transactionsToImport = (conciliationResult.unmatchedTransactions as UnmatchedTransaction[])
        .filter(tx => selectedTxs.includes(tx.id))
        .map(({ id, ...rest }) => rest);

      await batchAddConciliatedTransactions(bankAccount.id, transactionsToImport);
      toast({ title: '¡Éxito!', description: `${transactionsToImport.length} transacciones han sido importadas y el saldo ha sido actualizado.` });
      handleClose();
    } catch (error: any) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error al importar', description: error.message });
        setStep('review');
    }
  };

  const handleSelectTx = (id: string, checked: boolean) => {
    if (checked) {
        setSelectedTxs(prev => [...prev, id]);
    } else {
        setSelectedTxs(prev => prev.filter(txId => txId !== id));
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked && conciliationResult) {
        setSelectedTxs((conciliationResult.unmatchedTransactions as UnmatchedTransaction[]).map(tx => tx.id));
    } else {
        setSelectedTxs([]);
    }
  }

  const renderContent = () => {
    if (step === 'processing') {
      return (
        <div className="flex flex-col items-center justify-center text-center p-12 space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <h3 className="text-lg font-semibold">Procesando...</h3>
          <p className="text-muted-foreground">La inteligencia artificial está analizando tu estado de cuenta. Por favor, espera.</p>
        </div>
      );
    }

    if (step === 'review' && conciliationResult) {
        const unmatched = conciliationResult.unmatchedTransactions as UnmatchedTransaction[];
        return (
            <div className="space-y-4">
                <Alert>
                    <Sparkles className="h-4 w-4" />
                    <AlertTitle>Revisa las Transacciones Encontradas</AlertTitle>
                    <AlertDescription>
                        La IA ha encontrado {unmatched.length} transacciones en el PDF que no están en tu registro. Selecciona las que quieres importar.
                    </AlertDescription>
                </Alert>
                <ScrollArea className="max-h-[40vh] border rounded-lg">
                   <Table>
                     <TableHeader className="sticky top-0 bg-muted">
                        <TableRow>
                            <TableHead className="w-[50px]"><Checkbox onCheckedChange={handleSelectAll} checked={unmatched.length > 0 && selectedTxs.length === unmatched.length} /></TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Descripción</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                        </TableRow>
                     </TableHeader>
                     <TableBody>
                        {unmatched.map(tx => (
                            <TableRow key={tx.id}>
                                <TableCell><Checkbox onCheckedChange={(c) => handleSelectTx(tx.id, !!c)} checked={selectedTxs.includes(tx.id)}/></TableCell>
                                <TableCell>{format(new Date(tx.date), 'dd/MM/yyyy')}</TableCell>
                                <TableCell>{tx.description}</TableCell>
                                <TableCell>
                                    <span className={`font-semibold ${tx.type === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {tx.type === 'ingreso' ? 'Ingreso' : 'Egreso'}
                                    </span>
                                </TableCell>
                                <TableCell className="text-right font-mono">${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                            </TableRow>
                        ))}
                     </TableBody>
                   </Table>
                   {unmatched.length === 0 && (
                        <div className="p-8 text-center text-muted-foreground">
                            <Check className="h-8 w-8 mx-auto mb-2 text-emerald-500"/>
                            <p className="font-semibold">¡Todo en orden!</p>
                            <p>No se encontraron transacciones faltantes en el estado de cuenta.</p>
                        </div>
                   )}
                </ScrollArea>
                {conciliationResult.exceptions.length > 0 && (
                    <div>
                        <h4 className="font-semibold mb-2 flex items-center gap-2"><FileWarning className="h-5 w-5 text-amber-500" /> Excepciones y Advertencias</h4>
                        <Alert variant="destructive" className="max-h-32 overflow-y-auto">
                            <ul className="list-disc pl-5 space-y-1">
                                {conciliationResult.exceptions.map((ex, i) => <li key={i}>{ex}</li>)}
                            </ul>
                        </Alert>
                    </div>
                )}
            </div>
        );
    }
    
    return (
        <div className="space-y-4">
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors">
                <FileUp className="h-10 w-10 mx-auto text-muted-foreground mb-2"/>
                <h3 className="font-semibold">Haz clic para seleccionar el estado de cuenta</h3>
                <p className="text-sm text-muted-foreground">Sube el archivo en formato PDF</p>
                <input type="file" ref={fileInputRef} className="hidden" accept="application/pdf" onChange={handleFileChange}/>
            </div>
            {file && (
                <div className="flex items-center justify-between text-sm bg-muted/50 p-2 rounded-md">
                    <span>{file.name}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setFile(null)}><X className="h-4 w-4"/></Button>
                </div>
            )}
        </div>
    );
  };

  const renderFooter = () => {
    if (step === 'upload') {
        return (
            <>
                <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
                <Button onClick={handleConciliate} disabled={!file}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Conciliar con IA
                </Button>
            </>
        )
    }
    if (step === 'review') {
         return (
            <>
                <Button variant="ghost" onClick={() => setStep('upload')}>Volver</Button>
                <Button onClick={handleImport} disabled={selectedTxs.length === 0}>
                    <Plus className="mr-2 h-4 w-4" />
                    Importar ({selectedTxs.length}) Transaccion(es)
                </Button>
            </>
        )
    }
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Conciliar Estado de Cuenta</DialogTitle>
          <DialogDescription>
            La IA analizará tu PDF y lo comparará con tus registros para encontrar discrepancias.
          </DialogDescription>
        </DialogHeader>
        {renderContent()}
        <DialogFooter className="pt-4 border-t">
           {renderFooter()}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
