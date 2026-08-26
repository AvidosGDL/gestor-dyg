'use client';

import React, { useState, useMemo } from 'react';
import { useInvestors } from '@/contexts/investors-context';
import { Investor, InvestmentUsage } from '@/lib/types';
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
    HandCoins,
    Loader2,
    ShieldCheck,
    ArrowRightLeft,
    Briefcase,
    Eye,
    Filter,
    X,
    Users
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '../ui/badge';
import EditInvestorDialog from './edit-investor-dialog';
import { format, parseISO, addMonths, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '../ui/label';

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

  // Estados para Filtros de Destino de Capital
  const [usageSearch, setUsageSearch] = useState('');
  const [usageStartDate, setUsageStartDate] = useState('');
  const [usageEndDate, setUsageEndDate] = useState('');
  const [usageMinAmount, setUsageMinAmount] = useState('');
  const [usageMaxAmount, setUsageMaxAmount] = useState('');

  const handleEdit = (investor: Investor) => {
    setEditingInvestor(investor);
  };
  
  const handleCloseDialog = () => {
    setEditingInvestor(null);
  };

  const liveEditingInvestor = useMemo(() => {
    if (!editingInvestor) return null;
    return investors.find(i => i.id === editingInvestor.id) || editingInvestor;
  }, [investors, editingInvestor]);

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
            
        const toRecover = inv.fundUsage
            ?.filter(u => u.isToRecover)
            .reduce((sum, u) => sum + u.amount, 0) || 0;

        acc.totalCapital += inv.investmentAmount;
        acc.totalPaid += paidInterest;
        acc.totalPending += (totalInterestExpected - paidInterest);
        acc.totalToRecover += toRecover;
        return acc;
    }, { totalCapital: 0, totalPaid: 0, totalPending: 0, totalToRecover: 0 });
  }, [filteredInvestors]);

  // Lista global de todos los usos de capital
  const allUsages = useMemo(() => {
    const list: (InvestmentUsage & { investorName: string, investorId: string })[] = [];
    investors.forEach(inv => {
        if (inv.fundUsage) {
            inv.fundUsage.forEach(usage => {
                list.push({ ...usage, investorName: inv.name, investorId: inv.id });
            });
        }
    });
    
    return list.filter(u => {
        const matchesSearch = u.description.toLowerCase().includes(usageSearch.toLowerCase()) || 
                             u.investorName.toLowerCase().includes(usageSearch.toLowerCase());
        
        const date = parseISO(u.date);
        const matchesDate = (!usageStartDate || date >= startOfDay(parseISO(usageStartDate))) &&
                          (!usageEndDate || date <= endOfDay(parseISO(usageEndDate)));
        
        const matchesAmount = (!usageMinAmount || u.amount >= Number(usageMinAmount)) &&
                            (!usageMaxAmount || u.amount <= Number(usageMaxAmount));
        
        return matchesSearch && matchesDate && matchesAmount;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [investors, usageSearch, usageStartDate, usageEndDate, usageMinAmount, usageMaxAmount]);

  if (loading) {
    return <div className="flex items-center justify-center h-60"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <>
    <div className="h-full space-y-6 overflow-y-auto p-2">
        {/* Panel de Resumen Global */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-primary text-primary-foreground border-none shadow-lg shadow-primary/20">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">Capital bajo gestión</p>
                            <p className="text-2xl font-bold">${stats.totalCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <Wallet size={32} className="opacity-20" />
                    </div>
                </CardContent>
            </Card>
            <Card className="bg-emerald-600 text-white border-none shadow-lg shadow-emerald-600/20">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">Intereses pagados</p>
                            <p className="text-2xl font-bold">${stats.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <HandCoins size={32} className="opacity-20" />
                    </div>
                </CardContent>
            </Card>
            <Card className="bg-amber-500 text-white border-none shadow-lg shadow-amber-500/20">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">Obligación pendiente</p>
                            <p className="text-2xl font-bold">${stats.totalPending.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <TrendingUp size={32} className="opacity-20" />
                    </div>
                </CardContent>
            </Card>
            <Card className="bg-blue-600 text-white border-none shadow-lg shadow-blue-600/20">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">Total Por Recuperar</p>
                            <p className="text-2xl font-bold">${stats.totalToRecover.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <ShieldCheck size={32} className="opacity-20" />
                    </div>
                </CardContent>
            </Card>
        </div>

        <Tabs defaultValue="list" className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-md mb-4">
                <TabsTrigger value="list" className="gap-2">
                    <Users size={16}/> Cartera de Inversionistas
                </TabsTrigger>
                <TabsTrigger value="destinations" className="gap-2">
                    <Briefcase size={16}/> Destino de las Inversiones
                </TabsTrigger>
            </TabsList>

            <TabsContent value="list" className="space-y-6">
                {/* Barra de Filtros Inversionistas */}
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
                        <h3 className="text-lg font-semibold text-foreground/80">Sin resultados</h3>
                        <p className="text-sm mt-2">No se encontraron inversionistas con estos criterios.</p>
                    </div>
                )}
            </TabsContent>

            <TabsContent value="destinations" className="space-y-4">
                {/* Filtros Globales de Destino de Capital */}
                <div className="bg-card border rounded-xl p-4 space-y-4 shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Origen (Inversionista) o Concepto</Label>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input value={usageSearch} onChange={e => setUsageSearch(e.target.value)} placeholder="Ej. Mario Madrigal, Proyecto X..." className="pl-8 h-9 text-xs" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Rango de Fechas</Label>
                            <div className="flex gap-2">
                                <Input type="date" value={usageStartDate} onChange={e => setUsageStartDate(e.target.value)} className="h-9 text-[10px]" />
                                <Input type="date" value={usageEndDate} onChange={e => setUsageEndDate(e.target.value)} className="h-9 text-[10px]" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Montos ($)</Label>
                            <div className="flex items-center gap-2">
                                <Input type="number" value={usageMinAmount} onChange={e => setUsageMinAmount(e.target.value)} placeholder="Mín" className="h-9 text-xs" />
                                <Input type="number" value={usageMaxAmount} onChange={e => setUsageMaxAmount(e.target.value)} placeholder="Máx" className="h-9 text-xs" />
                            </div>
                        </div>
                        <div className="flex items-end">
                            <Button variant="ghost" size="sm" className="h-9 text-xs gap-1.5" onClick={() => {
                                setUsageSearch(''); setUsageStartDate(''); setUsageEndDate(''); setUsageMinAmount(''); setUsageMaxAmount('');
                            }}>
                                <X size={14}/> Limpiar Filtros
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50">
                                <TableHead>Fecha</TableHead>
                                <TableHead>Origen (Inversionista)</TableHead>
                                <TableHead>Destino / Concepto (Destinatario)</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead className="text-right">Monto</TableHead>
                                <TableHead className="text-right">Evidencia</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {allUsages.map((usage, idx) => (
                                <TableRow key={`${usage.investorId}-${usage.id}-${idx}`} className="hover:bg-muted/30">
                                    <TableCell className="text-xs whitespace-nowrap">{format(parseISO(usage.date), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell className="font-bold text-sm text-primary">{usage.investorName}</TableCell>
                                    <TableCell className="text-sm font-medium">{usage.description}</TableCell>
                                    <TableCell>
                                        {usage.isToRecover ? (
                                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1 text-[10px]">
                                                <ShieldCheck size={10}/> Por Recuperar
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="bg-slate-50 text-slate-600 text-[10px]">Gasto</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-bold">
                                        ${usage.amount.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            {usage.attachments?.map((att, i) => (
                                                <Button key={i} variant="ghost" size="icon" className="h-7 w-7" asChild>
                                                    <a href={att.url} target="_blank" rel="noopener noreferrer">
                                                        <Eye size={14}/>
                                                    </a>
                                                </Button>
                                            ))}
                                            {(!usage.attachments || usage.attachments.length === 0) && <span className="text-[10px] text-muted-foreground italic">Sin comprobante</span>}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {allUsages.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-20 text-muted-foreground">
                                        <Briefcase size={40} className="mx-auto mb-3 opacity-20"/>
                                        <p>No se encontraron registros de uso de capital.</p>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </TabsContent>
        </Tabs>
    </div>
    {liveEditingInvestor && (
        <EditInvestorDialog
            isOpen={!!liveEditingInvestor}
            onOpenChange={handleCloseDialog}
            investor={liveEditingInvestor}
        />
    )}
    </>
  );
}
