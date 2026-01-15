
'use client';

import React, { useState } from 'react';
import { useInvestors } from '@/contexts/investors-context';
import { Investor } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Edit, Phone, Mail, Calendar, DollarSign, Percent, Landmark, CalendarClock, Repeat } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '../ui/badge';
import EditInvestorDialog from './edit-investor-dialog';
import { format, parseISO } from 'date-fns';

function InvestorCard({ investor, onEdit }: { investor: Investor, onEdit: (investor: Investor) => void }) {
  const getPaymentInfo = () => {
    if (investor.paymentType === 'mensual' && investor.monthlyPaymentDay) {
        return `Día ${investor.monthlyPaymentDay} de cada mes`;
    }
    if (investor.paymentType === 'pago_unico' && investor.liquidationDate) {
        return `Liquidación el ${format(parseISO(investor.liquidationDate), 'dd/MM/yyyy')}`;
    }
    return 'No definido';
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>{investor.name}</CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <Mail size={14} className="text-muted-foreground" /> {investor.email || 'Sin correo'}
            </CardDescription>
            <CardDescription className="flex items-center gap-2">
              <Phone size={14} className="text-muted-foreground" /> {investor.phone || 'Sin teléfono'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between">
        <div>
            <div className="text-sm text-muted-foreground mb-3 grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                    <DollarSign size={14} />
                    <span>${(investor.investmentAmount || 0).toLocaleString()}</span>
                </div>
                 <div className="flex items-center gap-2">
                    <Percent size={14} />
                    <span>{(investor.interestRate || 0)}% Interés</span>
                </div>
            </div>
             <div className="space-y-2 text-xs">
                <Badge variant="secondary" className="flex items-center gap-2 w-fit">
                    {investor.paymentType === 'mensual' ? <Repeat size={14} /> : <CalendarClock size={14} />}
                    {getPaymentInfo()}
                </Badge>
                <Badge variant={investor.status === 'Activa' ? 'outline' : 'destructive'}>{investor.status}</Badge>
            </div>
        </div>
        <Button variant="outline" className="w-full mt-4" onClick={() => onEdit(investor)}>
          <Edit size={16} className="mr-2" /> Ver / Editar
        </Button>
      </CardContent>
    </Card>
  );
}

export default function InvestorsView() {
  const { investors, loading } = useInvestors();
  const [editingInvestor, setEditingInvestor] = useState<Investor | null>(null);

  const handleEdit = (investor: Investor) => {
    setEditingInvestor(investor);
  };
  
  const handleCloseDialog = () => {
    setEditingInvestor(null);
  };


  if (loading) {
    return <p>Cargando inversionistas...</p>;
  }

  return (
    <>
    <div className="h-full space-y-6 overflow-y-auto p-2">
        {investors.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {investors.map(investor => (
                <InvestorCard key={investor.id} investor={investor} onEdit={handleEdit} />
                ))}
            </div>
        ) : (
            <div className="flex flex-col items-center justify-center h-60 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                <Landmark size={48} className="mb-4" />
                <h3 className="text-lg font-semibold">No hay inversionistas registrados</h3>
                <p className="text-sm">Haz clic en "Nuevo Inversionista" para empezar.</p>
            </div>
        )}
    </div>
    {editingInvestor && (
        <EditInvestorDialog
            isOpen={!!editingInvestor}
            onOpenChange={handleCloseDialog}
            investor={editingInvestor}
        />
    )}
    </>
  );
}
