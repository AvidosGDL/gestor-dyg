

'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
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
import { Button, buttonVariants } from '@/components/ui/button';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTasks } from '@/contexts/tasks-context';
import { DollarSign, Percent, Users, Paperclip, X, Timer, Play, Square, History, Clock, Calendar as CalendarIcon, Eye, Download, Loader2, ArrowRight } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Task, TaskStatus, FocusSession, TeamMember, Attachment, EditLogEntry } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { Calendar } from '../ui/calendar';


const fileSchema = z.object({
  name: z.string(),
  type: z.string(),
  size: z.number(),
  url: z.string(),
});

const taskSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  client: z.string().optional(),
  progress: z.coerce.number().min(0).max(100),
  priority: z.enum(['low', 'medium', 'high']),
  dueDate: z.string().optional(),
  delegateToEmail: z.string().optional(),
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

const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const formatDuration = (milliseconds: number) => {
    if (isNaN(milliseconds) || milliseconds < 0) {
      return '0s';
    }
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let result = '';
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0) result += `${minutes}m `;
    if (seconds > 0 || (hours === 0 && minutes === 0)) result += `${seconds}s`;

    return result.trim();
};

const getFieldName = (field: string) => {
    const names: Record<string, string> = {
        title: 'Título',
        client: 'Cliente/Proyecto',
        progress: 'Progreso',
        priority: 'Prioridad',
        dueDate: 'Fecha Límite',
        status: 'Estado',
        value: 'Potencial',
        probability: 'Probabilidad',
        delegateToEmail: 'Delegado A'
    };
    return names[field] || field;
};

const formatFieldValue = (field: string, value: any) => {
    if (value === null || value === undefined || value === '') return 'vacío';
    if (field === 'dueDate' && typeof value === 'string') return format(parseISO(value), "dd/MM/yyyy");
    if (field === 'progress' || field === 'probability') return `${value}%`;
    if (field === 'value') return `$${Number(value).toLocaleString()}`;
    return value;
};


export default function EditTaskDialog({ open, onOpenChange, task }: EditTaskDialogProps) {
  const { updateTask } = useTasks();
  const { user } = useUser();
  const firestore = useFirestore();

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
  });

  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const watchedStatus = form.watch('status');

  const [isTracking, setIsTracking] = useState(false);
  const [sessionStart, setSessionStart] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  const collectionPath = user ? `users/${user.uid}/teamMembers` : null;
  const membersCollectionRef = useMemoFirebase(() => {
    return collectionPath ? collection(firestore, collectionPath) : null;
  }, [collectionPath, firestore]);
  const { data: members } = useCollection<TeamMember>(membersCollectionRef);

  const totalTime = useMemo(() => {
    if (!task.focusSessions) return 0;
    return task.focusSessions.reduce((acc, session) => {
        const start = new Date(session.startTime).getTime();
        const end = new Date(session.endTime).getTime();
        if (isNaN(start) || isNaN(end)) {
            return acc;
        }
        return acc + (end - start);
    }, 0);
  }, [task.focusSessions]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isTracking && sessionStart) {
      timer = setInterval(() => {
        setElapsedTime(Math.floor((new Date().getTime() - sessionStart.getTime()) / 1000));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isTracking, sessionStart]);

  const handleToggleTracking = () => {
    if (isTracking) {
      // Detener
      const endTime = new Date();
      if (!sessionStart) return; // Should not happen
      
      const newSession: FocusSession = {
        startTime: sessionStart.toISOString(),
        endTime: endTime.toISOString(),
      };
      
      const updatedSessions = [...(task.focusSessions || []), newSession];
      updateTask(task.id, { focusSessions: updatedSessions, updatedAt: new Date().toISOString() }, user, []);
      
      const durationMs = endTime.getTime() - sessionStart.getTime();

      toast({
        title: "Sesión guardada",
        description: `Se ha añadido ${formatDuration(durationMs)} a la tarea.`,
      });
      setIsTracking(false);
      setSessionStart(null);
      setElapsedTime(0);
    } else {
      // Iniciar
      setIsTracking(true);
      setSessionStart(new Date());
    }
  };


  useEffect(() => {
    if (task && open) {
        form.reset({
            ...task,
            delegateToEmail: task.delegateToEmail || 'null',
            dueDate: task.dueDate ? task.dueDate.split('T')[0] : undefined,
            completionComment: task.completionComment || '',
            attachments: task.attachments || [],
        });
        setAttachedFiles([]); 
        setIsUploading(false);
        setIsTracking(false);
        setSessionStart(null);
        setElapsedTime(0);
    }
  }, [task, open, form, user, updateTask]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setAttachedFiles(prevFiles => [...prevFiles, ...Array.from(event.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
  };
  
  const handleDownload = (fileUrl: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  const onSubmit = async (data: TaskFormValues) => {
    setIsUploading(true);
    let newAttachments: Attachment[] = [];

    try {
      if (attachedFiles.length > 0) {
        const storage = getStorage();
        const uploadPromises = attachedFiles.map(async file => {
            const fileRef = storageRef(storage, `task_attachments/${task.id}/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(fileRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            return {
                name: file.name,
                type: file.type,
                size: file.size,
                url: downloadURL,
            };
        });
        newAttachments = await Promise.all(uploadPromises);
      }

      const finalData: Partial<Task> = {
        ...data,
      };

      updateTask(task.id, finalData, user, newAttachments);
      toast({
          title: "Tarea actualizada",
          description: `"${data.title}" ha sido modificada.`,
      });
      onOpenChange(false);

    } catch (error) {
        console.error("Error al subir archivos o actualizar tarea:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "No se pudieron subir los archivos. Por favor, inténtalo de nuevo.",
        });
    } finally {
      setIsUploading(false);
    }
  };
  
  const isOwner = user?.uid === task.ownerId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex justify-between items-start">
            <div>
              <DialogTitle>Editar Tarea</DialogTitle>
              <DialogDescription>
                Modifica los detalles de la tarea.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-4 text-right">
              <div className="flex flex-col items-center">
                 <Button variant={isTracking ? "destructive" : "outline"} size="sm" onClick={handleToggleTracking}>
                  {isTracking ? <Square className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                  {isTracking ? 'Detener' : 'Iniciar Trabajo'}
                </Button>
                 {isTracking && (
                  <span className="text-xs font-mono font-bold mt-1 text-destructive animate-pulse">{formatTime(elapsedTime)}</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground border-l pl-4">
                  <History className="h-5 w-5"/>
                  <div>
                    <div className="font-bold">{formatTime(Math.floor(totalTime / 1000))}</div>
                    <div className="text-xs">Total Acumulado</div>
                  </div>
              </div>
            </div>
          </div>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[65vh] overflow-y-auto pr-6 pl-1 pt-4 border-t">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tarea</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Ej. Revisar el diseño del landing page"
                      rows={2}
                      {...field}
                    />
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
                        <Input placeholder="Nombre del Proyecto" className="pl-9" {...field} disabled={!isOwner} />
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
                render={({ field: { onChange, value, ...restField } }) => (
                  <FormItem>
                    <FormLabel>Potencial del Negocio ($)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder="Valor en USD"
                          className="pl-9"
                          value={value ? value.toLocaleString('en-US') : '0'}
                          onChange={(e) => {
                            const rawValue = e.target.value.replace(/[^0-9]/g, '');
                            const numericValue = rawValue === '' ? 0 : Number(rawValue);
                            onChange(numericValue);
                          }}
                          onBlur={(e) => {
                            const numericValue = Number(e.target.value.replace(/[^0-9]/g, ''));
                            e.target.value = numericValue.toLocaleString('en-US');
                          }}
                          disabled={!isOwner}
                          {...restField}
                        />
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
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!isOwner}>
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
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha Límite</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={!isOwner}
                          >
                            {field.value ? (
                              format(parseISO(field.value), "dd/MM/yyyy")
                            ) : (
                              <span>Elige una fecha</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value ? parseISO(field.value) : undefined}
                          onSelect={(date) => field.onChange(date?.toISOString().split('T')[0])}
                          disabled={(date) => date < new Date("1900-01-01")}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
             <FormField
              control={form.control}
              name="delegateToEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delegar A (por Correo)</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value || 'null'} disabled={!isOwner}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Seleccionar miembro del equipo..."/>
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="null">Nadie / Tarea personal</SelectItem>
                            {members?.map(member => (
                              <SelectItem key={member.id} value={member.email}>
                                {member.email} ({member.name})
                              </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </FormItem>
              )}
            />
             <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                     <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!isOwner}>
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

             {task.focusSessions && task.focusSessions.length > 0 && (
                <div className="space-y-4 pt-4 border-t">
                    <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Sesiones de Enfoque
                    </h4>
                    <ScrollArea className="max-h-[150px] pr-4">
                        <div className="space-y-3">
                        {task.focusSessions.slice().reverse().map((session, index) => {
                            const start = new Date(session.startTime);
                            const end = new Date(session.endTime);
                            const duration = end.getTime() - start.getTime();
                            return (
                            <div key={index} className="flex justify-between items-center text-xs p-2 bg-muted/50 rounded-md">
                                <div>
                                <p className="font-medium text-foreground">
                                    {format(start, "dd/MM/yyyy", { locale: es })}
                                </p>
                                <p className="text-muted-foreground">
                                    {start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} - {end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                                </div>
                                <Badge variant="secondary">{formatDuration(duration)}</Badge>
                            </div>
                            );
                        })}
                        </div>
                    </ScrollArea>
                </div>
            )}
            
            {['en-progreso', 'cierre', 'completado'].includes(watchedStatus) && (
              <div className="space-y-4 pt-4 border-t">
                <FormField
                  control={form.control}
                  name="completionComment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Comentarios / Cierre</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Añade un comentario sobre el avance o la finalización de la tarea..." {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormItem>
                  <FormLabel>Adjuntar Archivos</FormLabel>
                  <FormControl>
                     <div>
                        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                           {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Paperclip className="mr-2 h-4 w-4" />}
                           Seleccionar Archivos
                        </Button>
                        <Input 
                          type="file"
                          ref={fileInputRef}
                          multiple
                          className="hidden"
                          onChange={handleFileChange}
                          accept=".pdf,.doc,.docx,.xls,.xlsx,image/*,.zip,.rar"
                          disabled={isUploading}
                        />
                     </div>
                  </FormControl>
                  <div className="mt-4 space-y-2">
                    {task.attachments?.map((file, index) => (
                      <div key={`existing-${index}`} className="flex items-center justify-between p-2 bg-muted/50 rounded-md text-sm">
                        <span className="truncate flex-1 mr-2">{file.name}</span>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(file.url, '_blank')}>
                              <Eye size={14} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(file.url, file.name)}>
                              <Download size={14} />
                          </Button>
                        </div>
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
            
            {task.editHistory && task.editHistory.length > 0 && (
                <div className="space-y-4 pt-4 border-t">
                    <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                        <History className="h-4 w-4" />
                        Historial de Cambios
                    </h4>
                    <ScrollArea className="max-h-[150px] pr-4">
                        <div className="space-y-3">
                        {task.editHistory.slice().reverse().map((log: EditLogEntry, index: number) => (
                            <div key={index} className="text-xs p-2 bg-muted/50 rounded-md">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-bold text-foreground">{log.user}</span>
                                    <span className="text-muted-foreground">{formatDistanceToNow(parseISO(log.date), { addSuffix: true, locale: es })}</span>
                                </div>
                                <ul className="space-y-1 list-disc pl-4">
                                {log.changes && log.changes.map((change, cIndex) => (
                                    <li key={cIndex} className="text-muted-foreground">
                                        <span className="font-semibold text-foreground/80">{getFieldName(change.field)}: </span>
                                        <span className="text-destructive line-through">{formatFieldValue(change.field, change.from)}</span>
                                        <ArrowRight className="inline-block mx-1 h-3 w-3" />
                                        <span className="text-emerald-600">{formatFieldValue(change.field, change.to)}</span>
                                    </li>
                                ))}
                                </ul>
                            </div>
                        ))}
                        </div>
                    </ScrollArea>
                </div>
            )}
          </form>
        </Form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" onClick={form.handleSubmit(onSubmit)} disabled={isUploading}>
            {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
