'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTasks } from '@/contexts/tasks-context';
import { DollarSign, Percent, Users, Paperclip, X } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Task, TaskStatus } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';

const fileSchema = z.object({
  name: z.string(),
  type: z.string(),
  size: z.number(),
});

const taskSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  client: z.string().optional(),
  progress: z.coerce.number().min(0).max(100),
  priority: z.enum(['low', 'medium', 'high']),
  dueDate: z.string().optional(),
  delegateTo: z.string().optional(),
  status: z.enum(['pendiente', 'en-progreso', 'cierre', 'completado']),
  description: z.string().optional(),
  value: z.coerce.number().min(0),
  probability: z.coerce.number().min(0).max(100),
  completionComment: z.string().optional(),
  attachments: z.array(fileSchema).optional(),
});

type TaskFormValues = z.infer<typeof taskSchema>;

interface EditTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
}

export default function EditTaskDialog({ open, onOpenChange, task }: EditTaskDialogProps) {
  const { updateTask } = useTasks();
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
  });

  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const watchedStatus = form.watch('status');

  useEffect(() => {
    if (task && open) {
        form.reset({
            ...task,
            dueDate: task.dueDate ? task.dueDate.split('T')[0] : '', // Format date for input
            completionComment: task.completionComment || '',
        });
        setAttachedFiles([]); // Reset files on open
    }
  }, [task, open, form]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setAttachedFiles(prevFiles => [...prevFiles, ...Array.from(event.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
  };


  const onSubmit = (data: TaskFormValues) => {
    // Here you would handle file uploads to a service like Firebase Storage
    // For now, we'll just include metadata in the task update.
    const fileMetadata = attachedFiles.map(file => ({
      name: file.name,
      type: file.type,
      size: file.size,
    }));

    const finalData = {
      ...data,
      attachments: [...(task.attachments || []), ...fileMetadata],
    };

    updateTask(task.id, finalData);
    toast({
        title: "Tarea actualizada",
        description: `"${data.title}" ha sido modificada.`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar Tarea</DialogTitle>
          <DialogDescription>
            Modifica los detalles de la tarea.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-6 pl-1">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título de la Tarea</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej. Revisar el diseño del landing page" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <FormField
                control={form.control}
                name="client"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proyecto / Cliente</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Users size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder="Nombre del Proyecto" className="pl-9" {...field} />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="progress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Progreso (%) - {field.value}%</FormLabel>
                    <FormControl>
                      <Slider
                        min={0} max={100} step={5}
                        defaultValue={[field.value]}
                        onValueChange={(value) => field.onChange(value[0])}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Potencial del Negocio ($)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input type="number" placeholder="Valor en USD" className="pl-9" {...field} />
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="probability"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Probabilidad de Éxito - {field.value}%</FormLabel>
                    <FormControl>
                      <Slider
                        min={0} max={100} step={5}
                        defaultValue={[field.value]}
                        onValueChange={(value) => field.onChange(value[0])}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioridad</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecciona una prioridad" />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="low">Baja</SelectItem>
                            <SelectItem value="medium">Media</SelectItem>
                            <SelectItem value="high">Alta / Urgente</SelectItem>
                        </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha Límite</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="delegateTo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delegar A</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre del responsable..." {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
             <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                     <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecciona un estado" />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="pendiente">Pendiente</SelectItem>
                            <SelectItem value="en-progreso">En Progreso</SelectItem>
                            <SelectItem value="cierre">Cierre</SelectItem>
                            <SelectItem value="completado">Completado</SelectItem>
                        </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            
            {watchedStatus === 'completado' && (
              <div className="space-y-4 pt-4 border-t">
                <FormField
                  control={form.control}
                  name="completionComment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Comentario de Cierre</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Añade un comentario sobre la finalización de la tarea..." {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormItem>
                  <FormLabel>Adjuntar Archivos</FormLabel>
                  <FormControl>
                     <div>
                        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                           <Paperclip className="mr-2 h-4 w-4" />
                           Seleccionar Archivos
                        </Button>
                        <Input 
                          type="file"
                          ref={fileInputRef}
                          multiple
                          className="hidden"
                          onChange={handleFileChange}
                          accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                        />
                     </div>
                  </FormControl>
                  <div className="mt-4 space-y-2">
                    {task.attachments?.map((file, index) => (
                      <div key={`existing-${index}`} className="flex items-center justify-between p-2 bg-muted/50 rounded-md text-sm">
                        <span className="truncate">{file.name}</span>
                        <Badge variant="secondary">Ya adjunto</Badge>
                      </div>
                    ))}
                    {attachedFiles.map((file, index) => (
                      <div key={`new-${index}`} className="flex items-center justify-between p-2 bg-muted rounded-md text-sm">
                        <span className="truncate">{file.name}</span>
                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFile(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </FormItem>
              </div>
            )}
          </form>
        </Form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" onClick={form.handleSubmit(onSubmit)}>Guardar Cambios</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
