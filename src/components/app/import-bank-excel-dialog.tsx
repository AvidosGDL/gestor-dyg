'use client';

import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { FileSpreadsheet, Loader2, Plus, X, ArrowRight, Check, AlertCircle } from 'lucide-react';
import { useBanks } from '@/contexts/banks-context';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '../ui/scroll-area';
import { format, parse } from 'date-fns';
import * as XLSX from 'xlsx';

type Step = 'upload' | 'review' | 'importing';

interface ExcelRow {
  Fecha: any;
  Descripción: string;
  Cargo?: number;
  Abonos?: number;
  'a facturar'?: string;
}

interface ParsedTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'ingreso' | 'egreso';
  categories: string[];
}

interface ImportBankExcelDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  bankAccountId: string;
}

export default function ImportBankExcelDialog({ isOpen, onOpenChange, bankAccountId }: ImportBankExcelDialogProps) {
  const { toast } = useToast();
  const { batchAddConciliatedTransactions } = useBanks();

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedTxs, setParsedTxs] = useState<ParsedTransaction[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setStep('upload');
    setFileName(null);
    setParsedTxs([]);
    onOpenChange(false);
  };

  const parseExcelDate = (excelDate: any): string => {
    if (!excelDate) return new Date().toISOString();
    
    // If it's a number (Excel internal date format)
    if (typeof excelDate === 'number') {
      const date = new Date((excelDate - 25569) * 86400 * 1000);
      return date.toISOString();
    }
    
    // If it's a string, try common formats
    if (typeof excelDate === 'string') {
      try {
        // Try DD/MM/YYYY
        const parsed = parse(excelDate.trim(), 'dd/MM/yyyy', new Date());
        if (!isNaN(parsed.getTime())) return parsed.toISOString();
        
        // Try YYYY-MM-DD
        const parsedIso = new Date(excelDate);
        if (!isNaN(parsedIso.getTime())) return parsedIso.toISOString();
      } catch (e) {
        console.error("Error parsing date string:", excelDate);
      }
    }
    
    return new Date().toISOString();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as ExcelRow[];

        const transactions: ParsedTransaction[] = data.map((row, index) => {
          const isIngreso = !!row.Abonos && row.Abonos > 0;
          const amount = isIngreso ? Number(row.Abonos) : Number(row.Cargo || 0);
          const type = isIngreso ? 'ingreso' : 'egreso';
          const categories = row['a facturar'] ? [row['a facturar'].trim()] : [];

          return {
            id: crypto.randomUUID(),
            date: parseExcelDate(row.Fecha),
            description: row.Descripción || 'Sin descripción',
            amount: Math.abs(amount),
            type: type as 'ingreso' | 'egreso',
            categories: categories,
          };
        }).filter(tx => tx.amount > 0);

        setParsedTxs(transactions);
        setStep('review');
      } catch (error) {
        console.error(error);
        toast({ variant: 'destructive', title: 'Error de lectura', description: 'No se pudo procesar el archivo Excel. Verifica el formato.' });
        setFileName(null);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleImport = async () => {
    if (parsedTxs.length === 0) return;
    setStep('importing');
    
    try {
      // Re-map to the format expected by context (removing local ID)
      const toImport = parsedTxs.map(({ id, ...rest }) => rest);
      await batchAddConciliatedTransactions(bankAccountId, toImport);
      
      toast({ title: '¡Éxito!', description: `${toImport.length} movimientos importados correctamente.` });
      handleClose();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error al importar', description: error.message });
      setStep('review');
    }
  };

  const renderContent = () => {
    if (step === 'importing') {
      return (
        <div className="flex flex-col items-center justify-center p-12 space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="font-medium">Guardando movimientos en la cuenta...</p>
        </div>
      );
    }

    if (step === 'review') {
      return (
        <div className="space-y-4">
          <div className="bg-primary/5 border border-primary/20 p-3 rounded-lg flex items-start gap-3">
             <Check className="h-5 w-5 text-primary mt-0.5" />
             <div className="text-sm">
                <p className="font-bold">Archivo procesado: {fileName}</p>
                <p className="text-muted-foreground">Se encontraron {parsedTxs.length} movimientos válidos. Por favor, revisa la lista antes de confirmar.</p>
             </div>
          </div>
          <ScrollArea className="h-[40vh] border rounded-md">
            <Table>
              <TableHeader className="sticky top-0 bg-muted z-10">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>A Facturar</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedTxs.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap">{format(new Date(tx.date), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="max-w-[300px] truncate" title={tx.description}>{tx.description}</TableCell>
                    <TableCell>
                       {tx.categories[0] && <span className="bg-muted px-2 py-0.5 rounded text-[10px] font-bold uppercase">{tx.categories[0]}</span>}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-bold ${tx.type === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {tx.type === 'ingreso' ? '+' : '-'}${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      );
    }

    return (
      <div className="space-y-6 py-4">
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:bg-muted/50 transition-all group"
        >
          <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground group-hover:text-primary mb-4 transition-colors" />
          <h3 className="font-bold text-lg">Selecciona tu archivo de Excel</h3>
          <p className="text-sm text-muted-foreground mt-2">
            El archivo debe contener las columnas: <br/>
            <span className="font-mono text-xs bg-muted px-1">Fecha</span>, 
            <span className="font-mono text-xs bg-muted px-1">Descripción</span>, 
            <span className="font-mono text-xs bg-muted px-1">Cargo</span>, 
            <span className="font-mono text-xs bg-muted px-1">Abonos</span>, 
            <span className="font-mono text-xs bg-muted px-1">a facturar</span>
          </p>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".xlsx, .xls, .csv" 
            onChange={handleFileChange} 
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
            <AlertCircle size={14} />
            <span>Asegúrate de que los encabezados coincidan exactamente para una importación correcta.</span>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar desde Excel</DialogTitle>
          <DialogDescription>
            Carga masivamente movimientos bancarios desde una hoja de cálculo.
          </DialogDescription>
        </DialogHeader>
        
        {renderContent()}

        <DialogFooter className="pt-4 border-t">
          <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
          {step === 'review' && (
            <Button onClick={handleImport} className="gap-2">
              Confirmar Importación <ArrowRight size={16} />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
