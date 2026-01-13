

'use client';

import React, { useState } from 'react';
import {
  Briefcase,
  Calendar,
  DollarSign,
  Edit,
  Percent,
  Timer,
  Trash2,
  Clock,
  CheckCircle2,
  ThumbsUp,
  ThumbsDown,
  UserCheck,
  User,
  Archive,
  Eye,
  History,
  Pencil,
  Send,
} from 'lucide-react';
import { useTasks } from '@/contexts/tasks-context';
import type { Task, TaskStatus, TeamMember, EditLogEntry } from '@/lib/types';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isPast, parseISO, format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useCollection, useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, deleteDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface TaskCardProps {
  task: Task;
  setActiveTaskForPomodoro: (task: Task | null) => void;
  onEdit: (task: Task) => void;
}

const getPriorityColor = (p: Task['priority']) => {
  if (p === 'high') return '#ef4444'; // rose-500
  if (p === 'medium') return '#f59e0b'; // amber-500
  return '#3b82f6'; // blue-500
};

const getProgressColor = (prob: number) => {
  if (prob >= 80) return 'bg-emerald-500';
  if (prob >= 50) return 'bg-amber-500';
  return 'bg-blue-500';
};

const getPotentialColor = (value: number) => {
    if (value >= 10000) return 'bg-purple-500';
    if (value >= 5000) return 'bg-indigo-500';
    return 'bg-sky-500';
}

const formatFocusTime = (milliseconds: number) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function TaskCard({ task, setActiveTaskForPomodoro, onEdit }: TaskCardProps) {
  const { deleteTask, updateTask } = useTasks();
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [confirmationText, setConfirmationText] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);


  const collectionPath = user ? `users/${user.uid}/teamMembers` : null;
  const membersCollectionRef = useMemoFirebase(() => {
    return collectionPath ? collection(firestore, collectionPath) : null;
  }, [collectionPath, firestore]);
  const { data: members } = useCollection<TeamMember>(membersCollectionRef);

  const delegatedMember = members?.find(m => m.uid === task.delegateToId);
  const ownerMember = members?.find(m => m.uid === task.ownerId);

  const handleStatusChange = (newStatus: TaskStatus) => {
    updateTask(task.id, { status: newStatus }, user);
  }
  
  const handleDelegation = (status: 'accepted' | 'rejected') => {
    updateTask(task.id, { delegationStatus: status }, user);
  };

  const handleCompleteTask = () => {
    updateTask(task.id, { status: 'completado', progress: 100 }, user);
  }
  
  const handleSendDelegationEmail = async () => {
    if (!firestore || !user || !task.delegateToId || !task.delegateToEmail) {
      toast({ variant: 'destructive', title: 'Error', description: 'Faltan datos para enviar el correo.' });
      return;
    }
    
    setIsSendingEmail(true);
    toast({ title: 'Enviando notificación...' });

    try {
      const functions = getFunctions();
      const sendEmailFunction = httpsCallable(functions, 'sendEmailTask');

      const delegateUserDoc = await getDoc(doc(firestore, 'users', task.delegateToId));
      const delegateName = delegateUserDoc.data()?.name || 'un miembro del equipo';

      const delegatorName = task.delegatedByName || user?.displayName || 'un administrador';

      const payload = {
        to: task.delegateToEmail,
        delegateName: delegateName,
        taskId: task.id,
        taskTitle: task.title,
        delegatorName: delegatorName,
        taskUrl: `${window.location.origin}/?task=${task.id}`
      };
      
      await sendEmailFunction(payload);

      toast({
        title: "Notificación enviada",
        description: `Se ha notificado a ${delegateName} sobre la tarea.`,
      });
    } catch (emailError: any) {
      console.error('Error calling sendEmailTask:', emailError);
      toast({
        variant: "destructive",
        title: "Error al notificar",
        description: emailError.message || "No se pudo enviar el correo de notificación.",
      });
    } finally {
      setIsSendingEmail(false);
    }
  };


  const totalFocusTimeMs = React.useMemo(() => {
    if (!task.focusSessions) return 0;
    return task.focusSessions.reduce((total, session) => {
      const start = new Date(session.startTime).getTime();
      const end = new Date(session.endTime).getTime();
      return total + (end - start);
    }, 0);
  }, [task.focusSessions]);

  const isDelegatedToCurrentUser = user?.uid === task.delegateToId;
  const isDelegationPending = task.delegationStatus === 'pending';
  const isOwner = user?.uid === task.ownerId;
  const lastEdit: EditLogEntry | undefined = task.editHistory && task.editHistory.length > 0
    ? task.editHistory[task.editHistory.length - 1]
    : undefined;

  const creatorName = ownerMember?.name || task.delegatedByName || 'Desconocido';


  return (
    <Card
      className="group relative border-l-4 flex flex-col"
      style={{ borderLeftColor: getPriorityColor(task.priority) }}
    >
      <CardContent className="p-4 flex-1">
        {isDelegatedToCurrentUser && isDelegationPending && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-2 rounded-lg transition-opacity opacity-0 group-hover:opacity-100">
             <p className="text-sm font-bold text-foreground">Tarea delegada por {task.delegatedByName}</p>
             <div className="flex gap-2">
                <Button size="sm" onClick={() => handleDelegation('accepted')}><ThumbsUp className="mr-2 h-4 w-4"/> Aceptar</Button>
                <Button size="sm" variant="outline" onClick={() => handleDelegation('rejected')}><ThumbsDown className="mr-2 h-4 w-4" /> Rechazar</Button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-[1fr_auto] items-start gap-x-2">
            <div></div>
             
            <div className="flex gap-1 justify-self-end">
                {task.status !== 'completado' ? (
                  <>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-emerald-500"
                        onClick={handleCompleteTask}
                        title="Completar Tarea"
                    >
                        <CheckCircle2 size={16} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        onClick={() => setActiveTaskForPomodoro(task)}
                        title="Enfocar en esto"
                    >
                        <Timer size={16} />
                    </Button>
                  </>
                ) : null}
                 <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                    onClick={() => onEdit(task)}
                    title="Editar Tarea"
                >
                    <Edit size={16} />
                </Button>
            </div>

            <h4 className="col-span-2 mt-1 font-bold text-foreground break-all min-w-0">
                {task.title}
            </h4>
        </div>

        <div className="flex items-center text-sm text-muted-foreground mb-3 gap-2 mt-2">
          <Briefcase size={14} />
          <span className="font-medium">{task.client || 'Sin Proyecto'}</span>
        </div>

        <div className="bg-muted/50 rounded-lg p-2 mb-3 grid grid-cols-1 gap-3 text-xs">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-muted-foreground flex items-center gap-1"><Percent size={12} /> Progreso</span>
              <span className="font-bold text-foreground text-right">
                {task.progress}%
              </span>
            </div>
            <div className="w-full bg-border h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full ${getProgressColor(task.progress)}`}
                style={{ width: `${task.progress}%` }}
              ></div>
            </div>
          </div>
           <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-muted-foreground flex items-center gap-1"><DollarSign size={12} /> Potencial</span>
              <span className="font-bold text-foreground text-right">
                ${task.value.toLocaleString()}
              </span>
            </div>
            <div className="w-full bg-border h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full ${getPotentialColor(task.value)}`}
                style={{ width: `${Math.min((task.value / 20000) * 100, 100)}%` }}
              ></div>
            </div>
          </div>
           <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-muted-foreground flex items-center gap-1">Probabilidad</span>
              <span className="font-bold text-foreground text-right">
                {task.probability}%
              </span>
            </div>
            <div className="w-full bg-border h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full ${getProgressColor(task.probability)}`}
                style={{ width: `${task.probability}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="flex flex-col space-y-2 text-xs mt-2">
            <div className="flex justify-between items-center">
                <div className="flex flex-col gap-2 items-start">
                    
                    <Badge variant="outline" className="flex items-center gap-1.5">
                        <User size={12} />
                        Creada por: {creatorName}
                    </Badge>

                    {task.delegateToId && delegatedMember && (
                         <Badge variant="secondary" className="flex items-center gap-1.5">
                            <UserCheck size={12} />
                            Delegada a: {delegatedMember.name} ({delegatedMember.email})
                        </Badge>
                    )}

                    {totalFocusTimeMs > 0 && (
                        <div className="flex items-center gap-1 text-muted-foreground font-medium">
                            <Clock size={12} />
                            <span>{formatFocusTime(totalFocusTimeMs)}</span>
                        </div>
                    )}
                </div>
                {task.dueDate && (
                    <div
                    className={`flex items-center gap-1 self-start ${
                        isPast(parseISO(task.dueDate)) && task.status !== 'completado'
                        ? 'text-destructive font-bold'
                        : 'text-muted-foreground'
                    }`}
                    >
                    <Calendar size={12} />
                    <span>
                        {format(parseISO(task.dueDate), 'dd/MM/yyyy')}
                    </span>
                    </div>
                )}
            </div>
        </div>
        
        {task.status !== 'completado' && !isDelegationPending && (
             <div className="mt-3 pt-3 border-t flex justify-between text-xs text-muted-foreground">
                <Button variant="link" size="sm" className="p-0 h-auto" disabled={task.status === 'pendiente'} onClick={() => handleStatusChange('pendiente')}>← Pendiente</Button>
                <Button variant="link" size="sm" className="p-0 h-auto" disabled={task.status === 'en-progreso'} onClick={() => handleStatusChange('en-progreso')}>En Progreso →</Button>
                <Button variant="link" size="sm" className="p-0 h-auto" disabled={task.status === 'cierre'} onClick={() => handleStatusChange('cierre')}>Cierre →</Button>
            </div>
        )}
      </CardContent>
       
       <CardFooter className="p-2 border-t mt-auto flex justify-between items-center">
            {task.status === 'completado' && isOwner ? (
                <div className="flex w-full gap-2">
                    <Button variant="outline" className="w-full" onClick={() => onEdit(task)}>
                        <Eye size={16} className="mr-2"/>
                        Revisar
                    </Button>
                    <AlertDialog onOpenChange={() => setConfirmationText('')}>
                        <AlertDialogTrigger asChild>
                            <Button variant="secondary" className="w-full">
                            <Archive size={16} className="mr-2"/>
                            Archivar
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>¿Confirmas que quieres archivar esta tarea?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Esta acción es permanente y moverá la tarea al histórico. Para confirmar, escribe{" "}
                                <span className="font-bold text-foreground">ARCHIVAR</span> a continuación.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="space-y-2">
                            <Label htmlFor="delete-confirmation">Confirmación</Label>
                            <Input 
                                id="delete-confirmation"
                                value={confirmationText}
                                onChange={(e) => setConfirmationText(e.target.value)}
                                autoComplete="off"
                            />
                            </div>
                            <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction 
                                onClick={() => deleteTask(task.id)}
                                disabled={confirmationText !== 'ARCHIVAR'}
                                className="bg-destructive hover:bg-destructive/90"
                            >
                                Sí, archivar
                            </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            ) : (
                 <div className="flex items-center gap-4 text-xs text-muted-foreground w-full">
                    {task.createdAt && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 cursor-default">
                                <History size={12} />
                                <span>Creado {formatDistanceToNow(parseISO(task.createdAt), { addSuffix: true, locale: es })}</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{format(parseISO(task.createdAt), "d MMMM, yyyy 'a las' HH:mm", { locale: es })}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    )}
                    {lastEdit && (
                     <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                           <div className="flex items-center gap-1 cursor-default">
                                <Pencil size={12} />
                                <span>Editado {formatDistanceToNow(parseISO(lastEdit.date), { addSuffix: true, locale: es })}</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{format(parseISO(lastEdit.date), "d MMMM, yyyy 'a las' HH:mm", { locale: es })} por {lastEdit.user}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    )}
                 </div>
            )}
            {task.status === 'completado' && !isOwner && (
                 <div className="w-full text-center text-xs text-muted-foreground py-2">
                    Tarea completada.
                </div>
            )}
        </CardFooter>
    </Card>
  );
}

    

