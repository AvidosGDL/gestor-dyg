
'use client';

import React, { useState, useMemo } from 'react';
import { useInvestors } from '@/contexts/investors-context';
import { Investor } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
    Trash2, 
    Edit, 
    Phone, 
    Mail, 
    Calendar, 
    DollarSign, 
    Percent, 
    Landmark, 
    CalendarClock, 
    Repeat, 
    ClockIcon,
    Search,
    LayoutGrid,
    List,
    ArrowUpDown,
    ChevronUp,
    ChevronDown,
    TrendingUp,
    Wallet,
    HandCoins
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '../ui/badge';
import EditInvestorDialog from './edit-investor-dialog';
import { format, parseISO, addMonths } from 'date-fns';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

function InvestorCard({ investor, onEdit }: { investor: Investor, onEdit: (investor: Investor) => void }) {
  
  const contractEndDate = investor.investmentDate && investor.investmentTerm
    ? format(addMonths(parseISO(investor.investmentDate), investor.investmentTerm), 'dd/MM/yyyy')
    : null;

  const getPaymentInfo = () => {
    if (investor.paymentType === 'mensual') {
        return `Pagos el día ${investor.monthlyPaymentDay || 'N/A'} de cada mes`;
    }
    if (investor.paymentType === 'pago_unico' && investor.liquidationDate) {
        return `Liquidación única: ${format(parseISO(investor.liquidationDate), 'dd/MM/yyyy')}`;
    }
    return 'Esquema de pago no definido';
  }

  return (
    <Card className="flex flex-col hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-lg">{investor.name}</CardTitle>
            <div className="space-y-1 mt-2">
                <CardDescription className="flex items-center gap-2 text-xs truncate">
                <Mail size={12} className="text-muted-foreground flex-shrink-0" /> {investor.email || 'Sin correo'}
                </CardDescription>
                <CardDescription className="flex items-center gap-2 text-xs truncate">
                <Phone size={12} className="text-muted-foreground flex-shrink-0" /> {investor.phone || 'Sin teléfono'}
                </CardDescription>
            </div>
          </div>
          <Badge variant={investor.status === 'Activa' ? 'outline' : 'destructive'} className="ml-2">
            {investor.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between pt-2">
        <div className="space-y-4">
            <div className="text-sm text-muted-foreground grid grid-cols-2 gap-y-3 gap-x-2 bg-muted/30 p-3 rounded-lg">
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground/70">Capital</span>
                    <span className="font-bold text-foreground">${(investor.investmentAmount || 0).toLocaleString()}</span>
                </div>
                 <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground/70">Tasa Anual</span>
                    <span className="font-bold text-primary">{(investor.interestRate || 0)}%</span>
                </div>
                 <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground/70">Plazo</span>
                    <span className="font-medium text-foreground">{investor.investmentTerm} meses</span>
                </div>
                {contractEndDate && (
                  <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground/70">Vencimiento</span>
                      <span className="font-medium text-foreground">{contractEndDate}</span>
                  </div>
                )}
            </div>
             <div className="space-y-2">
                <Badge variant="secondary" className="flex items-center gap-2 w-full justify-start py-1.5 px-3 h-auto">
                    {investor.paymentType === 'mensual' ? <Repeat size={14} className="text-primary"/> : <CalendarClock size={14} className="text-primary"/>}
                    <span className="text-[11px] font-medium leading-tight">{getPaymentInfo()}</span>
                </Badge>
            </div>
        </div>
        <Button variant="outline" className="w-full mt-4 h-9 gap-2" onClick={() => onEdit(investor)}>
          <Edit size={14} /> Ver Gestión / Pagos
        </Button>
      </CardContent>
    </Card>
  );
}

export default function InvestorsView() {
  const { investors, loading } = useInvestors();
  const [editingInvestor, setEditingInvestor] = useState<Investor | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [sortConfig, setSortConfig] = useState<{ direction: 'asc' | 'desc' }>({ direction: 'desc' });

  const handleEdit = (investor: Investor) => {
    setEditingInvestor(investor);
  };
  
  const handleCloseDialog = () => {
    setEditingInvestor(null);
  };

  const filteredInvestors = useMemo(() => {
    if (!investors) return [];
    return investors.filter(i => 
      i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (i.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (i.phone || '').toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => {
        const dateA = new Date(a.investmentDate).getTime();
        const dateB = new Date(b.investmentDate).getTime();
        return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
    });
  }, [investors, searchTerm, sortConfig]);

  const stats = useMemo(() => {
    return filteredInvestors.reduce((acc, inv) => {
        const monthlyInterest = (inv.investmentAmount * inv.interestRate) / 100;
        const totalInterestExpected = monthlyInterest * inv.investmentTerm;
        const paidInterest = inv.transactions
            ?.filter(t => t.type === 'Pago de Interés')
            .reduce((sum, t) => sum + t.amount, 0) || 0;

        acc.totalCapital += inv.investmentAmount;
        acc.totalPaid += paidInterest;
        acc.totalPending += (totalInterestExpected - paidInterest);
        return acc;
    }, { totalCapital: 0, totalPaid: 0, totalPending: 0 });
  }, [filteredInvestors]);

  if (loading) {
    return <div className="flex items-center justify-center h-60"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <>
    <div className="h-full space-y-6 overflow-y-auto p-2">
        {/* Panel de Resumen */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-primary text-primary-foreground border-none shadow-lg shadow-primary/20">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">Capital bajo gestión</p>
                            <p className="text-3xl font-bold">${stats.totalCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <Wallet size={40} className="opacity-20" />
                    </div>
                </CardContent>
            </Card>
            <Card className="bg-emerald-600 text-white border-none shadow-lg shadow-emerald-600/20">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">Intereses pagados</p>
                            <p className="text-3xl font-bold">${stats.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <HandCoins size={40} className="opacity-20" />
                    </div>
                </CardContent>
            </Card>
            <Card className="bg-amber-500 text-white border-none shadow-lg shadow-amber-500/20">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">Obligación pendiente</p>
                            <p className="text-3xl font-bold">${stats.totalPending.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <TrendingUp size={40} className="opacity-20" />
                    </div>
                </CardContent>
            </Card>
        </div>

        {/* Barra de Filtros y Herramientas */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card p-4 rounded-xl border border-border shadow-sm">
            <div className="relative w-full md:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Buscar por nombre, correo o teléfono..." 
                    className="pl-9 h-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="flex items-center gap-2 bg-muted p-1 rounded-lg border w-full md:w-auto">
                <Button 
                    variant={viewMode === 'cards' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    className="flex-1 md:flex-none h-8 gap-2"
                    onClick={() => setViewMode('cards')}
                >
                    <LayoutGrid size={16}/> Tarjetas
                </Button>
                <Button 
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    className="flex-1 md:flex-none h-8 gap-2"
                    onClick={() => setViewMode('list')}
                >
                    <List size={16}/> Listado
                </Button>
            </div>
        </div>

        {filteredInvestors.length > 0 ? (
            viewMode === 'cards' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredInvestors.map(investor => (
                        <InvestorCard key={investor.id} investor={investor} onEdit={handleEdit} />
                    ))}
                </div>
            ) : (
                <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableHead className="w-[250px]">Inversionista</TableHead>
                                <TableHead 
                                    className="cursor-pointer hover:text-primary transition-colors"
                                    onClick={() => setSortConfig(prev => ({ direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                >
                                    <div className="flex items-center gap-2">
                                        Fecha Inicio
                                        <ArrowUpDown size={14} className={sortConfig.direction ? 'text-primary' : 'text-muted-foreground'} />
                                    </div>
                                </TableHead>
                                <TableHead className="text-right">Inversión Inicial</TableHead>
                                <TableHead className="text-right">Pagos Realizados</TableHead>
                                <TableHead className="text-right">Pagos por Realizar</TableHead>
                                <TableHead className="text-center">Estado</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredInvestors.map(inv => {
                                const monthlyInterest = (inv.investmentAmount * inv.interestRate) / 100;
                                const totalInterestExpected = monthlyInterest * inv.investmentTerm;
                                const paidInterest = inv.transactions
                                    ?.filter(t => t.type === 'Pago de Interés')
                                    .reduce((sum, t) => sum + t.amount, 0) || 0;
                                const pendingInterest = totalInterestExpected - paidInterest;

                                return (
                                    <TableRow key={inv.id} className="group hover:bg-muted/30">
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-sm">{inv.name}</span>
                                                <span className="text-[10px] text-muted-foreground">{inv.email || inv.phone || 'Sin contacto'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm">
                                            {format(parseISO(inv.investmentDate), 'dd/MM/yyyy')}
                                            <div className="text-[10px] text-muted-foreground">{inv.investmentTerm} meses</div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold">
                                            ${inv.investmentAmount.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-emerald-600 font-medium">
                                            ${paidInterest.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-amber-600 font-medium">
                                            ${pendingInterest.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant={inv.status === 'Activa' ? 'outline' : 'destructive'} className="text-[10px]">
                                                {inv.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => handleEdit(inv)}>
                                                <Edit size={14} />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )
        ) : (
            <div className="flex flex-col items-center justify-center h-80 text-center text-muted-foreground border-2 border-dashed rounded-xl bg-card/50">
                <Landmark size={48} className="mb-4 opacity-20" />
                <h3 className="text-lg font-semibold text-foreground/80">
                    {searchTerm ? 'Sin coincidencias para la búsqueda' : 'No hay inversionistas registrados'}
                </h3>
                <p className="text-sm max-w-xs mx-auto mt-2">
                    {searchTerm ? 'Prueba con otros términos o limpia el filtro.' : 'Usa el botón "Nuevo Inversionista" de la parte superior para comenzar.'}
                </p>
                {searchTerm && (
                    <Button variant="link" className="mt-4 text-primary" onClick={() => setSearchTerm('')}>
                        Limpiar búsqueda
                    </Button>
                )}
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

function Loader2({ className }: { className?: string }) {
    return <svg className={cn("animate-spin h-5 w-5", className)} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>;
}
