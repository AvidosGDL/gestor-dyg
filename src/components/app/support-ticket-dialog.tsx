
'use client';

import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSupport } from '@/contexts/support-context';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Paperclip, X, Bug, Lightbulb } from 'lucide-react';

interface SupportTicketDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SupportTicketDialog({ isOpen, onOpenChange }: SupportTicketDialogProps) {
  const { addTicket } = useSupport();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<'bug' | 'improvement'>('bug');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'1' | '2' | '3'>('3');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getBrowserInfo = () => {
    const ua = navigator.userAgent;
    if (ua.includes("Firefox")) return "Mozilla Firefox";
    if (ua.includes("SamsungBrowser")) return "Samsung Internet";
    if (ua.includes("Opera") || ua.includes("OPR")) return "Opera";
    if (ua.includes("Edge")) return "Microsoft Edge";
    if (ua.includes("Chrome")) return "Google Chrome";
    if (ua.includes("Safari")) return "Apple Safari";
    return "Navegador Desconocido";
  };

  const getDeviceInfo = () => {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return "Dispositivo Android";
    if (/iPhone|iPad|iPod/i.test(ua)) return "Dispositivo iOS (iPhone/iPad)";
    if (/windows/i.test(ua)) return "Computadora Windows";
    if (/macintosh/i.test(ua)) return "Computadora Mac";
    if (/linux/i.test(ua)) return "Computadora Linux";
    return "Dispositivo Desconocido";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description) return;

    setIsSubmitting(true);
    try {
      await addTicket({
        type,
        description,
        severity: Number(severity) as 1 | 2 | 3,
        browser: getBrowserInfo(),
        device: getDeviceInfo(),
      }, attachedFiles);
      
      onOpenChange(false);
      setDescription('');
      setAttachedFiles([]);
      setSeverity('3');
      setType('bug');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo enviar el reporte.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reportar al Sistema</DialogTitle>
          <DialogDescription>Describe el problema o mejora. Capturaremos automáticamente tu navegador y dispositivo para el soporte.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
                <Label>¿Qué quieres reportar?</Label>
                <RadioGroup value={type} onValueChange={(v: any) => setType(v)} className="grid grid-cols-2 gap-4">
                    <div>
                        <RadioGroupItem value="bug" id="r-bug" className="peer sr-only" />
                        <Label htmlFor="r-bug" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-rose-500 [&:has([data-state=checked])]:border-rose-500 cursor-pointer transition-all">
                            <Bug className="mb-2 h-6 w-6 text-rose-500" />
                            <span className="text-xs font-bold">Un Bug / Error</span>
                        </Label>
                    </div>
                    <div>
                        <RadioGroupItem value="improvement" id="r-imp" className="peer sr-only" />
                        <Label htmlFor="r-imp" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all">
                            <Lightbulb className="mb-2 h-6 w-6 text-primary" />
                            <span className="text-xs font-bold">Una Mejora</span>
                        </Label>
                    </div>
                </RadioGroup>
            </div>

            <div className="space-y-2">
                <Label>Descripción del problema / idea</Label>
                <Textarea 
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Sé lo más específico posible. ¿Qué estabas haciendo cuando ocurrió?"
                    rows={4}
                    required
                />
            </div>

            <div className="space-y-2">
                <Label>Nivel de Urgencia / Severidad</Label>
                <Select value={severity} onValueChange={(v: any) => setSeverity(v)}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1">1 - Crítico (No puedo trabajar)</SelectItem>
                        <SelectItem value="2">2 - Alta (Requiere solución en 1-2 días)</SelectItem>
                        <SelectItem value="3">3 - Normal (Sin impacto inmediato en tiempo)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label>Evidencia (Fotos o Video)</Label>
                <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                        <Paperclip size={14} className="mr-2"/> Adjuntar
                    </Button>
                    <span className="text-[10px] text-muted-foreground">{attachedFiles.length} archivos seleccionados</span>
                </div>
                <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*,video/*" onChange={handleFileChange} />
                <div className="flex flex-wrap gap-2">
                    {attachedFiles.map((file, i) => (
                        <Badge key={i} variant="secondary" className="gap-1 pl-2 pr-1 h-6">
                            <span className="truncate max-w-[100px] text-[10px]">{file.name}</span>
                            <X size={10} className="cursor-pointer hover:text-destructive" onClick={() => removeFile(i)} />
                        </Badge>
                    ))}
                </div>
            </div>

            <DialogFooter className="pt-4 border-t">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button type="submit" disabled={isSubmitting || !description}>
                    {isSubmitting ? <Loader2 size={16} className="animate-spin mr-2"/> : null}
                    Enviar Reporte
                </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
