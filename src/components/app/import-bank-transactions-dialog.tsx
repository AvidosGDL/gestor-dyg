
'use client';

import React, { useState, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { FileUp, Loader2, Sparkles, X, Plus, Trash2, Edit } from 'lucide-react';
import { recognizeBankTransactions } from '@/ai/flows/recognize-bank-transactions-flow';
import { useBanks } from '@/contexts/banks-context';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { format } from 'date-fns';

type Step = 'upload' | 'review' | 'importing';

interface RecognizedTransaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  type: 'ingreso' | 'egreso';
  originalFileName: string;
}

interface ImportBankTransactionsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  bankAccountId: string;
}

export default function ImportBankTransactionsDialog({ isOpen, onOpenChange, bankAccountId }: ImportBankTransactionsDialogProps) {
  const { toast } = useToast();
  const { batchAddBankTransactions } = useBanks();
  const [step, setStep] = useState<Step>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [recognizedTxs, setRecognizedTxs] = useState<RecognizedTransaction[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setStep('upload');
    setFiles([]);
    setRecognizedTxs([]);
    onOpenChange(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files as FileList)]);
    }
  };

  const removeFile = (indexToRemove: number) => {
    setFiles(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleRecognize = async () => {
    if (files.length === 0) {
      toast({ variant: 'destructive', title: 'No hay archivos', description: 'Por favor, selecciona al menos un archivo.' });
      return;
    }
    setStep('importing');
    toast({ title: 'Procesando archivos...', description: 'La IA está extrayendo los datos. Esto puede tardar un momento.' });

    try {
      const filePromises = files.map(file => {
        return new Promise<{ dataUri: string; fileName: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve({ dataUri: e.target?.result as string, fileName: file.name });
          reader.onerror = e => reject(e);
          reader.readAsDataURL(file);
        });
      });

      const fileData = await Promise.all(filePromises);
      const result = await recognizeBankTransactions({ files: fileData });
      
      setRecognizedTxs(result.transactions.map(tx => ({ ...tx, id: crypto.randomUUID() })));
      setStep('review');
      toast({ title: 'Revisión necesaria', description: `${result.transactions.length} transacciones fueron reconocidas. Por favor, revísalas antes de importar.` });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error de IA', description: 'No se pudieron procesar los archivos.' });
      setStep('upload');
    }
  };

  const handleUpdateTx = (id: string, field: keyof RecognizedTransaction, value: string | number) => {
    setRecognizedTxs(prev => prev.map(tx => tx.id === id ? { ...tx, [field]: value } : tx));
  };

  const handleRemoveTx = (id: string) => {
    setRecognizedTxs(prev => prev.filter(tx => tx.id !== id));
  };
  
  const handleImport = async () => {
    if (recognizedTxs.length === 0) {
        toast({ variant: 'destructive', title: 'No hay transacciones', description: 'No hay nada que importar.' });
        return;
    }
    setStep('importing');
    toast({ title: 'Importando transacciones...' });

    try {
        const transactionsWithFiles = recognizedTxs.map(tx => {
            const originalFile = files.find(f => f.name === tx.originalFileName);
            if (!originalFile) throw new Error(`No se encontró el archivo original para ${tx.originalFileName}`);
            return {
                data: {
                    date: new Date(tx.date).toISOString(),
                    description: tx.description,
                    amount: tx.amount,
                    type: tx.type,
                },
                file: originalFile
            };
        });
        
        await batchAddBankTransactions(bankAccountId, transactionsWithFiles);
        handleClose();
    } catch (error: any) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error al importar', description: error.message });
        setStep('review');
    }
  };


  const renderContent = () => {
    if (step === 'importing') {
      return (
        <div className="flex flex-col items-center justify-center text-center p-12 space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <h3 className="text-lg font-semibold">Procesando...</h3>
          <p className="text-muted-foreground">La inteligencia artificial está analizando tus archivos. Por favor, espera.</p>
        </div>
      );
    }

    if (step === 'review') {
        return (
            <div className="space-y-4">
                 <Alert>
                    <Sparkles className="h-4 w-4" />
                    <AlertTitle>Revisa las Transacciones Reconocidas</AlertTitle>
                    <AlertDescription>
                        Ajusta cualquier dato incorrecto antes de confirmar la importación. Puedes eliminar transacciones que no quieras agregar.
                    </AlertDescription>
                </Alert>
                <div className="max-h-[50vh] overflow-y-auto border rounded-lg">
                   <Table>
                     <TableHeader className="sticky top-0 bg-muted">
                        <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Descripción</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                     </TableHeader>
                     <TableBody>
                        {recognizedTxs.map(tx => (
                            <TableRow key={tx.id}>
                                <TableCell>
                                    <Input type="date" value={format(new Date(tx.date), 'yyyy-MM-dd')} onChange={e => handleUpdateTx(tx.id, 'date', e.target.value)} className="w-[150px]" />
                                </TableCell>
                                <TableCell>
                                    <Input value={tx.description} onChange={e => handleUpdateTx(tx.id, 'description', e.target.value)} />
                                </TableCell>
                                <TableCell>
                                    <Select value={tx.type} onValueChange={(v: 'ingreso' | 'egreso') => handleUpdateTx(tx.id, 'type', v)}>
                                        <SelectTrigger><SelectValue/></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="egreso">Egreso</SelectItem>
                                            <SelectItem value="ingreso">Ingreso</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </TableCell>
                                <TableCell>
                                    <Input type="number" value={tx.amount} onChange={e => handleUpdateTx(tx.id, 'amount', Number(e.target.value))} className="text-right" />
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" onClick={() => handleRemoveTx(tx.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                </TableCell>
                            </TableRow>
                        ))}
                     </TableBody>
                   </Table>
                </div>
            </div>
        );
    }
    
    return (
        <div className="space-y-4">
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors">
                <FileUp className="h-10 w-10 mx-auto text-muted-foreground mb-2"/>
                <h3 className="font-semibold">Haz clic para seleccionar archivos</h3>
                <p className="text-sm text-muted-foreground">Sube uno o varios comprobantes (PDF, JPG, PNG)</p>
                <input type="file" ref={fileInputRef} multiple className="hidden" accept="image/jpeg,image/png,application/pdf" onChange={handleFileChange}/>
            </div>
            {files.length > 0 && (
                <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Archivos seleccionados:</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto p-2 border rounded-md">
                        {files.map((file, index) => (
                            <div key={index} className="flex items-center justify-between text-sm bg-muted/50 p-2 rounded">
                                <span>{file.name}</span>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFile(index)}><X className="h-4 w-4"/></Button>
                            </div>
                        ))}
                    </div>
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
                <Button onClick={handleRecognize} disabled={files.length === 0}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Procesar {files.length > 0 ? `(${files.length})` : ''} Archivo(s)
                </Button>
            </>
        )
    }
    if (step === 'review') {
         return (
            <>
                <Button variant="ghost" onClick={() => setStep('upload')}>Volver a Subir</Button>
                <Button onClick={handleImport} disabled={recognizedTxs.length === 0}>
                    <Plus className="mr-2 h-4 w-4" />
                    Importar {recognizedTxs.length > 0 ? `(${recognizedTxs.length})` : ''} Transaccion(es)
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
          <DialogTitle>Importar Transacciones desde Comprobantes</DialogTitle>
          <DialogDescription>
            Sube tus facturas o recibos en formato PDF o imagen y la IA extraerá los datos por ti.
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
