
'use client';

import React, { useState } from 'react';
import { useSupport } from '@/contexts/support-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, MessageSquare, AlertCircle, CheckCircle2, ChevronRight, User, Laptop, Monitor, Bug, Lightbulb, Eye, Paperclip, Send } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useUser } from '@/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import SupportTicketDialog from './support-ticket-dialog';

export default function SupportView() {
  const { tickets, loading, closeTicket } = useSupport();
  const { user } = useUser();
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [isSolutionDialogOpen, setIsSolutionDialogOpen] = useState(false);
  const [solutionText, setSolutionText] = useState('');
  const [solutionFile, setSolutionFile] = useState<File | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);

  const isAdmin = user?.email === 'gdldanny@gmail.com' || user?.email === 'Roger1996.developer@gmail.com';

  const handleCloseTicket = async () => {
    if (!selectedTicket || !solutionText) return;
    setIsClosing(true);
    await closeTicket(selectedTicket.id, solutionText, solutionFile || undefined);
    setIsClosing(false);
    setIsSolutionDialogOpen(false);
    setSelectedTicket(null);
    setSolutionText('');
    setSolutionFile(null);
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="h-full flex flex-col space-y-4 p-1">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Soporte Técnico</h2>
          <p className="text-muted-foreground">Reporta fallos o solicita mejoras para el sistema.</p>
        </div>
        <Button onClick={() => setShowReportDialog(true)} className="gap-2">
            <PlusIcon size={18}/> Nuevo Ticket
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden">
        <Card className="lg:col-span-1 flex flex-col overflow-hidden">
          <CardHeader>
            <CardTitle>Historial de Tickets</CardTitle>
            <CardDescription>{isAdmin ? 'Todos los tickets del sistema' : 'Tus reportes recientes'}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full">
              <div className="divide-y">
                {tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    onClick={() => setSelectedTicket(ticket)}
                    className={cn(
                      "p-4 cursor-pointer transition-colors hover:bg-muted/50",
                      selectedTicket?.id === ticket.id ? "bg-muted" : ""
                    )}
                  >
                    <div className="flex justify-between items-start mb-1">
                        <Badge variant={ticket.type === 'bug' ? 'destructive' : 'secondary'} className="text-[10px] uppercase">
                            {ticket.type === 'bug' ? <Bug size={10} className="mr-1"/> : <Lightbulb size={10} className="mr-1"/>}
                            {ticket.type === 'bug' ? 'Error' : 'Mejora'}
                        </Badge>
                        <Badge variant={ticket.status === 'open' ? 'outline' : 'default'} className={cn(ticket.status === 'open' ? 'border-amber-500 text-amber-600' : 'bg-emerald-500')}>
                            {ticket.status === 'open' ? 'Abierto' : 'Resuelto'}
                        </Badge>
                    </div>
                    <h4 className="font-bold text-sm line-clamp-1">{ticket.description}</h4>
                    <div className="flex justify-between items-center mt-2 text-[10px] text-muted-foreground font-medium">
                        <span>{format(new Date(ticket.createdAt), 'dd/MM/yy HH:mm')}</span>
                        <div className="flex items-center gap-1">
                            <SeverityBadge severity={ticket.severity} />
                        </div>
                    </div>
                  </div>
                ))}
                {tickets.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground italic text-sm">No hay tickets registrados.</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 flex flex-col overflow-hidden">
            {selectedTicket ? (
                <>
                    <CardHeader className="border-b bg-muted/20">
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle className="text-lg">Detalles del Ticket</CardTitle>
                                <CardDescription>ID: {selectedTicket.id}</CardDescription>
                            </div>
                            {isAdmin && selectedTicket.status === 'open' && (
                                <Button onClick={() => setIsSolutionDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                                    <CheckCircle2 size={16} className="mr-2"/> Resolver y Cerrar
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto p-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Descripción del Problema</Label>
                                    <p className="text-sm mt-1 whitespace-pre-wrap">{selectedTicket.description}</p>
                                </div>
                                <div className="flex gap-4">
                                    <div>
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Navegador</Label>
                                        <div className="flex items-center gap-2 mt-1 text-sm"><Monitor size={14}/> {selectedTicket.browser}</div>
                                    </div>
                                    <div>
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Dispositivo</Label>
                                        <div className="flex items-center gap-2 mt-1 text-sm"><Laptop size={14}/> {selectedTicket.device}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Usuario Reporta</Label>
                                    <div className="flex items-center gap-2 mt-1">
                                        <User size={14} className="text-primary"/>
                                        <span className="text-sm font-bold">{selectedTicket.creatorName}</span>
                                        <span className="text-xs text-muted-foreground">({selectedTicket.creatorEmail})</span>
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Evidencia</Label>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        {selectedTicket.attachments?.map((file: any, i: number) => (
                                            <a key={i} href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 border rounded-md hover:bg-muted text-xs truncate">
                                                <Eye size={12}/> {file.name}
                                            </a>
                                        ))}
                                        {(!selectedTicket.attachments || selectedTicket.attachments.length === 0) && <p className="text-xs text-muted-foreground italic">Sin archivos adjuntos</p>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {selectedTicket.status === 'closed' && (
                            <div className="mt-8 p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
                                <h4 className="font-bold text-emerald-800 flex items-center gap-2"><CheckCircle2 size={18}/> Resolución del Sistema</h4>
                                <p className="text-sm text-emerald-900 whitespace-pre-wrap">{selectedTicket.solution}</p>
                                {selectedTicket.solutionAttachment && (
                                    <Button variant="outline" size="sm" asChild className="border-emerald-300 text-emerald-700 bg-white">
                                        <a href={selectedTicket.solutionAttachment.url} target="_blank" rel="noopener noreferrer">
                                            <Eye size={14} className="mr-2"/> Ver imagen de solución
                                        </a>
                                    </Button>
                                )}
                                <div className="pt-2 text-[10px] text-emerald-600 flex justify-between">
                                    <span>Resuelto por: {selectedTicket.closedBy}</span>
                                    <span>Fecha: {format(new Date(selectedTicket.closedAt), "PPP 'a las' HH:mm", { locale: es })}</span>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-12 text-center">
                    <MessageSquare size={48} className="mb-4 opacity-20" />
                    <h3 className="text-lg font-bold">Selecciona un ticket</h3>
                    <p className="text-sm">Toca un reporte de la lista para ver los detalles técnicos y su resolución.</p>
                </div>
            )}
        </Card>
      </div>

      <SupportTicketDialog isOpen={showReportDialog} onOpenChange={setShowReportDialog} />

      <Dialog open={isSolutionDialogOpen} onOpenChange={setIsSolutionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver Ticket</DialogTitle>
            <DialogDescription>Explica la solución aplicada. El usuario recibirá un WhatsApp notificándole el cierre.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label>Descripción de la Solución</Label>
                <Textarea value={solutionText} onChange={(e) => setSolutionText(e.target.value)} placeholder="Ej. Se corrigió la validación del formulario de bancos..." rows={4} />
            </div>
            <div className="space-y-2">
                <Label>Imagen de la Solución (Opcional)</Label>
                <Input type="file" accept="image/*" onChange={(e) => setSolutionFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsSolutionDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCloseTicket} disabled={!solutionText || isClosing}>
                {isClosing ? <Loader2 size={16} className="animate-spin mr-2"/> : <Send size={16} className="mr-2"/>}
                Cerrar Ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: number }) {
  if (severity === 1) return <Badge className="bg-rose-500 text-white border-none text-[9px] px-1.5 h-4">CRÍTICO</Badge>;
  if (severity === 2) return <Badge className="bg-amber-500 text-white border-none text-[9px] px-1.5 h-4">PRIORIDAD</Badge>;
  return <Badge className="bg-blue-500 text-white border-none text-[9px] px-1.5 h-4">NORMAL</Badge>;
}

function PlusIcon({ size }: { size: number }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5v14"/></svg>;
}
