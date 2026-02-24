'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useProjects } from '@/contexts/projects-context';
import type { Project, ProjectActivity, Attachment } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, DollarSign, Percent, Paperclip, X, Eye, Download, Trash2, Video, Image as ImageIcon } from 'lucide-react';
import { Slider } from '../ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const activitySchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  startDate: z.string().min(1, "La fecha de inicio es requerida"),
  durationDays: z.coerce.number().min(0, "La duración no puede ser negativa"),
  dependencyId: z.string().nullable(),
  budgetedCost: z.coerce.number().min(0),
  actualCost: z.coerce.number().min(0),
  progress: z.coerce.number().min(0).max(100),
  parentId: z.string().nullable(),
});

type ActivityFormValues = z.infer<typeof activitySchema>;

interface EditActivityDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  project: Project;
  activity: ProjectActivity | null;
  projectActivities: ProjectActivity[];
  parentId: string | null;
}

export default function EditActivityDialog({ isOpen, onOpenChange, project, activity, projectActivities, parentId }: EditActivityDialogProps) {
  const { addActivity, updateActivity } = useProjects();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

  const form = useForm<ActivityFormValues>({
    resolver: zodResolver(activitySchema),
  });
  
  const watchProgress = form.watch('progress');

  useEffect(() => {
    if (isOpen) {
      if (activity) {
        form.reset({
          ...activity,
          startDate: activity.startDate.split('T')[0],
        });
      } else {
        form.reset({
          name: '',
          startDate: new Date().toISOString().split('T')[0],
          durationDays: 1,
          dependencyId: null,
          budgetedCost: 0,
          actualCost: 0,
          progress: 0,
          parentId: parentId,
        });
      }
      setAttachedFiles([]);
    }
  }, [isOpen, activity?.id, parentId]); // Solo resetear si cambia el ID o se abre
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeNewFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };
  
  const removeExistingAttachment = async (attachmentUrl: string) => {
    if (!activity) return;
    const newAttachments = activity.attachments?.filter(att => att.url !== attachmentUrl) || [];
    await updateActivity(project.id, activity.id, { attachments: newAttachments }, []);
    toast({ title: 'Adjunto eliminado' });
  }

  const onSubmit: SubmitHandler<ActivityFormValues> = async (data) => {
    try {
      if (activity) {
        await updateActivity(project.id, activity.id, data, attachedFiles);
        toast({ title: 'Actividad Actualizada' });
      } else {
        addActivity(project.id, data);
        toast({ title: 'Actividad Creada' });
      }
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };
  
  const renderFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return <ImageIcon className="h-5 w-5 text-muted-foreground" />;
    if (fileType.startsWith('video/')) return <Video className="h-5 w-5 text-muted-foreground" />;
    if (fileType === 'application/pdf') return <Paperclip className="h-5 w-5 text-muted-foreground" />;
    return <Paperclip className="h-5 w-5 text-muted-foreground" />;
  }

  const dialogTitle = activity ? 'Editar Actividad' : parentId ? 'Nueva Subtarea' : 'Nueva Actividad';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {activity ? 'Actualiza los detalles de la actividad.' : 'Define una nueva actividad para el proyecto.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-4 -mr-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre de la Actividad</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de Inicio</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="durationDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duración (días)</FormLabel>
                  <FormControl><Input type="number" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
           <FormField
              control={form.control}
              name="dependencyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dependencia (Actividad Anterior)</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(value === 'none' ? null : value)}
                    value={field.value || 'none'}
                  >
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Ninguna"/></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                          <SelectItem value="none">Ninguna</SelectItem>
                          {projectActivities.filter(a => a.id !== activity?.id).map(a => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                      </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
            )} />

          <FormField
            control={form.control}
            name="progress"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Progreso de Avance - {watchProgress || 0}%</FormLabel>
                <FormControl>
                  <Slider min={0} max={100} step={5} defaultValue={[activity?.progress || 0]} onValueChange={(v) => field.onChange(v[0])} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
           <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="budgetedCost"
              render={({ field: { onChange, value, ...restField } }) => (
                <FormItem>
                  <FormLabel>Costo Presupuestado ($)</FormLabel>
                  <FormControl>
                  <div className="relative">
                    <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      className="pl-9"
                      value={(value || 0).toLocaleString('en-US')}
                      onChange={(e) => {
                        const rawValue = e.target.value.replace(/[^0-9]/g, '');
                        const numericValue = rawValue === '' ? 0 : Number(rawValue);
                        onChange(numericValue);
                      }}
                      onBlur={(e) => {
                        const numericValue = Number(e.target.value.replace(/[^0-9]/g, ''));
                        e.target.value = numericValue.toLocaleString('en-US');
                      }}
                      {...restField}
                    />
                  </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="actualCost"
              render={({ field: { onChange, value, ...restField } }) => (
                <FormItem>
                  <FormLabel>Costo Real ($)</FormLabel>
                  <FormControl>
                  <div className="relative">
                    <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      className="pl-9"
                      value={(value || 0).toLocaleString('en-US')}
                      onChange={(e) => {
                        const rawValue = e.target.value.replace(/[^0-9]/g, '');
                        const numericValue = rawValue === '' ? 0 : Number(rawValue);
                        onChange(numericValue);
                      }}
                      onBlur={(e) => {
                        const numericValue = Number(e.target.value.replace(/[^0-9]/g, ''));
                        e.target.value = numericValue.toLocaleString('en-US');
                      }}
                      {...restField}
                    />
                  </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
           <div className="space-y-2 pt-4 border-t">
            <Label>Adjuntar Evidencia</Label>
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}><Paperclip className="mr-2 h-4 w-4" /> Subir Archivos</Button>
            <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*,video/*,.pdf" onChange={handleFileChange} />
             <div className="space-y-2">
                {activity?.attachments?.map(file => (
                  <div key={file.url} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded-md">
                    <div className="flex items-center gap-2 truncate flex-1">
                      {renderFileIcon(file.type)}
                      <span className="truncate">{file.name}</span>
                    </div>
                    <div className="flex items-center">
                      <Button asChild variant="ghost" size="icon" className="h-7 w-7"><a href={file.url} target="_blank" rel="noopener noreferrer"><Eye size={14} /></a></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeExistingAttachment(file.url)}><Trash2 size={14} className="text-destructive"/></Button>
                    </div>
                  </div>
                ))}
                {attachedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between text-sm p-2 bg-muted rounded-md">
                     <div className="flex items-center gap-2 truncate flex-1">
                        {renderFileIcon(file.type)}
                        <span className="truncate">{file.name}</span>
                      </div>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeNewFile(index)}><X size={14} /></Button>
                  </div>
                ))}
             </div>
          </div>
          
        </form>
        </Form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" onClick={form.handleSubmit(onSubmit)} disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}