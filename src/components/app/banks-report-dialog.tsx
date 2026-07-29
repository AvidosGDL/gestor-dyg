
'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText, Calendar as CalendarIcon, CheckSquare, Square, FileSpreadsheet } from 'lucide-react';
import { format, parseISO, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { useFirestore } from '@/firebase';
import { collection, query, getDocs, orderBy, where } from 'firebase/firestore';
import type { BankAccount, BankTransaction } from '@/lib/types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface BanksReportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  bankAccounts: BankAccount[];
}

export default function BanksReportDialog({ isOpen, onOpenChange, bankAccounts }: BanksReportDialogProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>(bankAccounts.map(b => b.id));

  const toggleBank = (id: string) => {
    setSelectedBankIds(prev => 
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedBankIds(bankAccounts.map(b => b.id));
  const deselectAll = () => setSelectedBankIds([]);

  const generatePDF = async () => {
    if (selectedBankIds.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Selecciona al menos un banco.' });
      return;
    }

    setIsGenerating(true);
    toast({ title: 'Generando reporte PDF...', description: 'Consultando movimientos de los bancos seleccionados.' });

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      
      // Header
      doc.setFontSize(18);
      doc.setTextColor(63, 81, 181); // Primary color
      doc.text('Reporte de Movimientos Bancarios', pageWidth / 2, 15, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Periodo: ${format(parseISO(startDate), 'dd/MM/yyyy')} al ${format(parseISO(endDate), 'dd/MM/yyyy')}`, pageWidth / 2, 22, { align: 'center' });
      doc.text(`Generado el: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, 27, { align: 'center' });

      let currentY = 35;

      for (const bankId of selectedBankIds) {
        const bank = bankAccounts.find(b => b.id === bankId);
        if (!bank) continue;

        // Fetch transactions for this bank
        const transactionsRef = collection(firestore, `banks/${bankId}/transactions`);
        const q = query(transactionsRef, orderBy('date', 'asc'));
        const snap = await getDocs(q);
        
        const allTransactions = snap.docs.map(d => ({ id: d.id, ...d.data() } as BankTransaction));
        
        // Filter by date range
        const periodTxs = allTransactions.filter(tx => {
            const txDate = parseISO(tx.date);
            return isWithinInterval(txDate, {
                start: parseISO(startDate + 'T00:00:00'),
                end: parseISO(endDate + 'T23:59:59')
            });
        });

        // Add Bank Header
        if (currentY > 250) { doc.addPage(); currentY = 20; }
        
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text(`${bank.companyName} - ${bank.bankName}`, 14, currentY);
        currentY += 6;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const identifier = bank.accountNumber || bank.clabe || bank.cardNumber || 'N/A';
        doc.text(`ID: ${identifier} | Saldo Actual: $${bank.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 14, currentY);
        currentY += 8;

        // Add Transactions Table
        const tableData = periodTxs.map(tx => [
          format(parseISO(tx.date), 'dd/MM/yyyy'),
          tx.description,
          tx.entityName || '-',
          tx.invoiceReference || '-',
          tx.type === 'ingreso' ? 'Ingreso' : 'Egreso',
          `$${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [['Fecha', 'Descripción', 'Empresa Rel.', 'Factura', 'Tipo', 'Monto']],
          body: tableData.length > 0 ? tableData : [['-', 'No hay movimientos en este periodo', '-', '-', '-', '-']],
          theme: 'striped',
          headStyles: { fillColor: [63, 81, 181] },
          margin: { left: 14, right: 14 },
          styles: { fontSize: 7 },
          columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 45 },
            2: { cellWidth: 35 },
            3: { cellWidth: 25 },
            4: { cellWidth: 15 },
            5: { cellWidth: 25, halign: 'right' },
          },
          didDrawPage: (data) => {
            currentY = data.cursor ? data.cursor.y + 15 : 20;
          }
        });
        
        if (currentY < (doc.internal.pageSize.height - 20)) {
           // Space before next bank
        } else {
           doc.addPage();
           currentY = 20;
        }
      }

      doc.save(`Reporte_Bancos_${startDate}_a_${endDate}.pdf`);
      toast({ title: 'Reporte PDF generado', description: 'El archivo se ha descargado correctamente.' });
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo generar el PDF.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const generateExcel = async () => {
    if (selectedBankIds.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Selecciona al menos un banco.' });
      return;
    }

    setIsGenerating(true);
    toast({ title: 'Generando reporte Excel...', description: 'Consultando y procesando movimientos.' });

    try {
      const allReportData = [];

      for (const bankId of selectedBankIds) {
        const bank = bankAccounts.find(b => b.id === bankId);
        if (!bank) continue;

        // Fetch transactions for this bank
        const transactionsRef = collection(firestore, `banks/${bankId}/transactions`);
        const q = query(transactionsRef, orderBy('date', 'asc'));
        const snap = await getDocs(q);
        
        const allTransactions = snap.docs.map(d => ({ id: d.id, ...d.data() } as BankTransaction));
        
        // Filter by date range
        const periodTxs = allTransactions.filter(tx => {
            const txDate = parseISO(tx.date);
            return isWithinInterval(txDate, {
                start: parseISO(startDate + 'T00:00:00'),
                end: parseISO(endDate + 'T23:59:59')
            });
        });

        const identifier = bank.accountNumber || bank.clabe || bank.cardNumber || 'N/A';

        periodTxs.forEach(tx => {
          allReportData.push({
            'Fecha': format(parseISO(tx.date), 'dd/MM/yyyy'),
            'Empresa Propietaria': bank.companyName,
            'Banco': bank.bankName,
            'Identificador de Cuenta': identifier,
            'Descripción': tx.description,
            'Empresa Relacionada': tx.entityName || '',
            'Factura / Referencia': tx.invoiceReference || '',
            'Tipo': tx.type === 'ingreso' ? 'Ingreso' : 'Egreso',
            'Monto': tx.amount,
            'Categorías': tx.categories?.join(', ') || '',
            'Usuario': tx.createdBy || 'Sistema'
          });
        });
      }

      if (allReportData.length === 0) {
        toast({ title: 'Sin movimientos', description: 'No se encontraron transacciones en el periodo seleccionado para los bancos elegidos.' });
        setIsGenerating(false);
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(allReportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Movimientos Bancarios");
      
      // Fix column widths for better manageability
      const wscols = [
        { wch: 12 }, // Fecha
        { wch: 25 }, // Empresa Prop
        { wch: 20 }, // Banco
        { wch: 22 }, // Identificador
        { wch: 40 }, // Descripción
        { wch: 25 }, // Empresa Rel
        { wch: 20 }, // Factura
        { wch: 12 }, // Tipo
        { wch: 15 }, // Monto
        { wch: 30 }, // Categorías
        { wch: 20 }  // Usuario
      ];
      worksheet['!cols'] = wscols;

      XLSX.writeFile(workbook, `Gestor_DyG_Reporte_Bancos_${startDate}_a_${endDate}.xlsx`);
      toast({ title: 'Reporte Excel generado', description: 'El archivo se ha descargado correctamente.' });
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo generar el archivo Excel.' });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generar Reporte de Movimientos</DialogTitle>
          <DialogDescription>
            Selecciona el periodo y las cuentas bancarias que deseas incluir en el reporte detallado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Fecha de Inicio</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fecha de Fin</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2 flex flex-col">
            <div className="flex items-center justify-between mb-2">
                <Label className="font-bold">Cuentas a Incluir</Label>
                <div className="flex gap-2">
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={selectAll}>Todas</Button>
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs text-destructive" onClick={deselectAll}>Ninguna</Button>
                </div>
            </div>
            <ScrollArea className="h-40 border rounded-md p-2">
              <div className="space-y-2">
                {bankAccounts.map(bank => (
                  <div key={bank.id} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`report-bank-${bank.id}`} 
                      checked={selectedBankIds.includes(bank.id)} 
                      onCheckedChange={() => toggleBank(bank.id)}
                    />
                    <label htmlFor={`report-bank-${bank.id}`} className="text-sm font-medium leading-none cursor-pointer truncate">
                      {bank.companyName} ({bank.bankName})
                    </label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="pt-4 border-t gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={generateExcel} disabled={isGenerating} className="gap-2 border-emerald-600 text-emerald-600 hover:bg-emerald-50">
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                Exportar Excel
            </Button>
            <Button onClick={generatePDF} disabled={isGenerating} className="gap-2">
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Generar PDF
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
