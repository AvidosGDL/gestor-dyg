

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

  const { register, handleSubmit, reset, control, watch, formState: { errors, isSubmitting } } = useForm<ActivityFormValues>({
    resolver: zodResolver(activitySchema),
  });
  
  const watchProgress = watch('progress');

  useEffect(() => {
    if (isOpen) {
      if (activity) {
        reset({
          ...activity,
          startDate: activity.startDate.split('T')[0],
        });
      } else {
        reset({
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
  }, [isOpen, activity, reset, parentId]);
  
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
        // Update existing activity
        await updateActivity(project.id, activity.id, data, attachedFiles);
        toast({ title: 'Actividad Actualizada' });
      } else {
        // Create new activity
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-4 -mr-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre de la Actividad</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Fecha de Inicio</Label>
              <Input id="startDate" type="date" {...register('startDate')} />
              {errors.startDate && <p className="text-sm text-destructive">{errors.startDate.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="durationDays">Duración (días)</Label>
              <Input id="durationDays" type="number" {...register('durationDays')} />
              {errors.durationDays && <p className="text-sm text-destructive">{errors.durationDays.message}</p>}
            </div>
          </div>
          
           <div className="space-y-2">
            <Label htmlFor="dependencyId">Dependencia (Actividad Anterior)</Label>
             <Controller
                name="dependencyId"
                control={control}
                render={({ field }) => (
                <Select
                  onValueChange={(value) => field.onChange(value === 'none' ? null : value)}
                  value={field.value || 'none'}
                >
                    <SelectTrigger><SelectValue placeholder="Ninguna"/></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">Ninguna</SelectItem>
                        {projectActivities.filter(a => a.id !== activity?.id).map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
             )} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="progress">Progreso de Avance - {watchProgress || 0}%</Label>
            <Slider id="progress" min={0} max={100} step={5} defaultValue={[activity?.progress || 0]} onValueChange={(v) => control.setValue('progress', v[0])} />
          </div>
          
           <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="budgetedCost">Costo Presupuestado ($)</Label>
              <div className="relative"><DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input id="budgetedCost" type="number" className="pl-9" {...register('budgetedCost')} /></div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="actualCost">Costo Real ($)</Label>
              <div className="relative"><DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input id="actualCost" type="number" className="pl-9" {...register('actualCost')} /></div>
            </div>
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
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
