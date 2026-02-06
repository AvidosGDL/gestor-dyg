
'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
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
import { DollarSign, Users, Calendar as CalendarIcon, Loader2, Paperclip, X } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Task, TeamMember, UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, getDoc } from 'firebase/firestore';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Calendar } from '../ui/calendar';
import { Textarea } from '../ui/textarea';

const taskSchema = z.object({
  title: z.string().min(1, 'El título es requerido'),
  client: z.string().optional(),
  progress: z.coerce.number().min(0).max(100),
  priority: z.enum(['low', 'medium', 'high']),
  dueDate: z.string().optional(),
  delegateToData: z.string().optional(), // Will store "email|uid" or "none"
  status: z.enum(['pendiente', 'en-progreso', 'cierre', 'completado']),
  description: z.string().optional(),
  value: z.coerce.number().min(0),
  probability: z.coerce.number().min(0).max(100),
});

type TaskFormValues = z.infer<typeof taskSchema>;

const defaultValues: Partial<TaskFormValues> = {
  title: '',
  client: '',
  progress: 0,
  priority: 'medium',
  dueDate: '',
  delegateToData: 'none',
  status: 'pendiente',
  description: '',
  value: 0,
  probability: 50,
};

interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function NewTaskDialog({ open, onOpenChange }: NewTaskDialogProps) {
  const { addTask } = useTasks();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<UserProfile & { id: string } | null>(null);

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues,
  });

  const myTeamCollectionPath = useMemo(() => {
    return user ? `users/${user.uid}/teamMembers` : null;
  }, [user]);

  const membersCollectionRef = useMemoFirebase(() => {
    return myTeamCollectionPath ? collection(firestore, myTeamCollectionPath) : null;
  }, [myTeamCollectionPath, firestore]);
  const { data: members } = useCollection<TeamMember>(membersCollectionRef);

  useEffect(() => {
    async function fetchProfiles() {
      if (firestore && user) {
        const userDocRef = doc(firestore, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const profile = userDocSnap.data() as UserProfile;
          setUserProfile(profile);
          if (profile.ownerId) {
            const ownerDocRef = doc(firestore, 'users', profile.ownerId);
            const ownerDocSnap = await getDoc(ownerDocRef);
            if (ownerDocSnap.exists()) {
              setOwnerProfile({ ...ownerDocSnap.data() as UserProfile, id: ownerDocSnap.id });
            }
          }
        }
      } else {
        setUserProfile(null);
        setOwnerProfile(null);
      }
    }
    if (open) {
      fetchProfiles();
    }
  }, [firestore, user, open]);

  const onSubmit = async (data: TaskFormValues) => {
    if (!user) return;
    
    setIsSubmitting(true);

    const [delegateToEmail, delegateToId] = data.delegateToData?.split('|') || [null, null];

    try {
      await addTask({
        ...data,
        delegateToEmail: delegateToEmail === 'none' ? null : delegateToEmail,
        delegateToId: delegateToId === 'none' || delegateToId === 'undefined' ? null : delegateToId,
      }, user, attachedFiles);

      toast({
          title: "Nueva tarea creada",
          description: `"${data.title}" ha sido añadida a tu lista.`,
      });
      onOpenChange(false);

    } catch (error) {
       toast({
          title: "Error al crear tarea",
          description: "No se pudo guardar la tarea. Inténtalo de nuevo.",
          variant: 'destructive'
      });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setAttachedFiles(prevFiles => [...prevFiles, ...Array.from(event.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
  };


  useEffect(() => {
    if (!open) {
      form.reset(defaultValues);
      setAttachedFiles([]);
    }
  }, [open, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Agregar Nueva Tarea</DialogTitle>
          <DialogDescription>
            Rellena los detalles de la nueva tarea o pendiente.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-6 pl-1">
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
                        defaultValue={[field.value || 0]}
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
                          value={value.toLocaleString('en-US')}
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
                        defaultValue={[field.value || 50]}
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
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha Límite (aaaa-mm-dd)</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          className="flex-1"
                          placeholder="aaaa-mm-dd"
                        />
                      </FormControl>
                      <Popover modal={false}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="icon" className="shrink-0">
                            <CalendarIcon className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
                          <Calendar
                            mode="single"
                            selected={field.value ? new Date(field.value) : undefined}
                            onSelect={(date) => field.onChange(date?.toISOString().split('T')[0])}
                            disabled={(date) => date < new Date("1900-01-01")}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="delegateToData"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delegar A</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || 'none'}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Seleccionar miembro del equipo..."/>
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="none">Nadie / Tarea personal</SelectItem>
                            {ownerProfile && (
                              <SelectItem value={`${ownerProfile.email}|${ownerProfile.id}`}>
                                {ownerProfile.name} (Jefe de Equipo)
                              </SelectItem>
                            )}
                            {members?.map(member => (
                              <SelectItem key={member.id} value={`${member.email}|${member.uid}`}>
                                {member.name} ({member.email})
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
                    <FormLabel>Estado Inicial</FormLabel>
                     <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder="Selecciona un estado" />
                        </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                            <SelectItem value="pendiente">Pendiente</SelectItem>
                            <SelectItem value="en-progreso">En Pregreso</SelectItem>
                            <SelectItem value="cierre">Cierre</SelectItem>
                            <SelectItem value="completado">Completado</SelectItem>
                        </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <div className="space-y-4 pt-4 border-t">
                <FormLabel>Adjuntar Archivos</FormLabel>
                <FormControl>
                   <div>
                      <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isSubmitting}>
                         {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Paperclip className="mr-2 h-4 w-4" />}
                         Seleccionar Archivos
                      </Button>
                      <Input 
                        type="file"
                        ref={fileInputRef}
                        multiple
                        className="hidden"
                        onChange={handleFileChange}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,image/*,.zip,.rar"
                        disabled={isSubmitting}
                      />
                   </div>
                </FormControl>
                <div className="mt-4 space-y-2">
                  {attachedFiles.map((file, index) => (
                    <div key={`new-${index}`} className="flex items-center justify-between p-2 bg-muted rounded-md text-sm">
                      <span className="truncate">{file.name}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeFile(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
          </form>
        </Form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" onClick={form.handleSubmit(onSubmit)} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar Tarea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
