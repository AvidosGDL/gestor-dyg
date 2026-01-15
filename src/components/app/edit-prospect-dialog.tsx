
'use client';

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useForm, type SubmitHandler, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { DollarSign, Loader2, Percent, PlusCircle, Trash2 } from 'lucide-react';
import { useProspects } from '@/contexts/prospects-context';
import { useToast } from '@/hooks/use-toast';
import type { Prospect, ContactLogEntry } from '@/lib/types';
import { ScrollArea } from '../ui/scroll-area';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Slider } from '../ui/slider';

const contactLogSchema = z.object({
  date: z.string(),
  notes: z.string().min(1, 'Las notas no pueden estar vacías'),
});

const prospectSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('Correo no válido').optional().or(z.literal('')),
  phone: z.string().optional(),
  businessDescription: z.string().min(1, 'La descripción es requerida'),
  nextContactDate: z.string().optional(),
  contactLog: z.array(contactLogSchema).optional(),
  value: z.coerce.number().min(0),
  probability: z.coerce.number().min(0).max(100),
});

type ProspectFormValues = z.infer<typeof prospectSchema>;

interface EditProspectDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  prospect: Prospect;
}

export default function EditProspectDialog({
  isOpen,
  onOpenChange,
  prospect,
}: EditProspectDialogProps) {
  const { updateProspect } = useProspects();
  const { toast } = useToast();
  const [newNote, setNewNote] = useState('');

  const form = useForm<ProspectFormValues>({
    resolver: zodResolver(prospectSchema),
    defaultValues: {
      ...prospect,
      nextContactDate: prospect.nextContactDate ? prospect.nextContactDate.split('T')[0] : '',
      contactLog: prospect.contactLog || [],
      value: prospect.value || 0,
      probability: prospect.probability || 50,
    },
  });
  
  const watchProbability = form.watch('probability');

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "contactLog",
  });
  
  useEffect(() => {
    if (isOpen) {
      form.reset({
        ...prospect,
        nextContactDate: prospect.nextContactDate ? prospect.nextContactDate.split('T')[0] : '',
        contactLog: prospect.contactLog || [],
        value: prospect.value || 0,
        probability: prospect.probability || 50,
      });
      setNewNote('');
    }
  }, [isOpen, prospect, form]);
  
  const handleAddNote = () => {
    if (newNote.trim() !== '') {
      append({ date: new Date().toISOString(), notes: newNote });
      setNewNote('');
    }
  };


  const onSubmit: SubmitHandler<ProspectFormValues> = async (data) => {
    try {
      updateProspect(prospect.id, { ...data, contactLog: data.contactLog || [] });
      toast({
        title: 'Prospecto Actualizado',
        description: `Los datos de ${data.name} han sido actualizados.`,
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al actualizar prospecto',
        description: error.message || 'Ocurrió un error inesperado.',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar Prospecto</DialogTitle>
          <DialogDescription>
            Actualiza la información y el historial de contacto.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] pr-2 -mr-4">
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="edit-name">Nombre del Prospecto</Label>
                <Input id="edit-name" {...form.register('name')} />
                {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-email">Correo Electrónico</Label>
                    <Input id="edit-email" type="email" {...form.register('email')} />
                    {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit-phone">Teléfono</Label>
                    <Input id="edit-phone" {...form.register('phone')} />
                </div>
            </div>
            
            <div className="space-y-2">
                <Label htmlFor="edit-businessDescription">Descripción del Negocio</Label>
                <Textarea id="edit-businessDescription" {...form.register('businessDescription')} />
                {form.formState.errors.businessDescription && <p className="text-sm text-destructive">{form.formState.errors.businessDescription.message}</p>}
            </div>
            
             <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-value">Valor del Negocio ($)</Label>
                <div className="relative">
                  <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="edit-value"
                    type="number"
                    step="100"
                    className="pl-9"
                    {...form.register('value')}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-probability">Probabilidad de Cierre - {watchProbability}%</Label>
                <Slider
                  id="edit-probability"
                  min={0} max={100} step={5}
                  defaultValue={[prospect.probability || 50]}
                  onValueChange={(value) => form.control.setValue('probability', value[0])}
                />
              </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="edit-nextContactDate">Fecha Próximo Contacto (Opcional)</Label>
                <Input id="edit-nextContactDate" type="date" {...form.register('nextContactDate')} />
            </div>
            
            <div className="space-y-4 pt-4 border-t">
              <Label>Historial de Contacto</Label>
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg text-sm">
                    <div className="flex-1">
                      <p className="font-semibold text-xs text-muted-foreground">
                        {format(new Date(field.date), "dd/MM/yyyy 'a las' HH:mm", { locale: es })}
                      </p>
                      <p className="text-foreground mt-1">{field.notes}</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(index)}>
                      <Trash2 size={14}/>
                    </Button>
                  </div>
                ))}
                {fields.length === 0 && <p className="text-center text-muted-foreground text-xs italic py-4">No hay registros de contacto.</p>}
              </div>
              <div className="flex gap-2">
                <Textarea 
                  placeholder="Añadir nueva nota de contacto..." 
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="flex-1"
                  rows={2}
                />
                <Button type="button" size="icon" onClick={handleAddNote} disabled={!newNote.trim()}>
                  <PlusCircle size={18} />
                </Button>
              </div>
            </div>
          </div>
          </ScrollArea>
          <DialogFooter className="pt-4 border-t">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
