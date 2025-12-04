'use client';

import React from 'react';
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
  Mail,
} from 'lucide-react';
import { useTasks } from '@/contexts/tasks-context';
import type { Task, TaskStatus, TeamMember } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isPast } from 'date-fns';
import { useCollection, useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '@/hooks/use-toast';


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


  const collectionPath = user ? `users/${user.uid}/teamMembers` : null;
  const membersCollectionRef = useMemoFirebase(() => {
    return collectionPath ? collection(firestore, collectionPath) : null;
  }, [collectionPath, firestore]);
  const { data: members } = useCollection<TeamMember>(membersCollectionRef);

  const delegatedMember = members?.find(m => m.id === task.delegateToId);
  
  const handleTestEmail = async () => {
    if (!delegatedMember || !user) {
      toast({
        variant: "destructive",
        title: "No se puede enviar correo",
        description: "Esta tarea no está delegada a un miembro del equipo válido.",
      });
      return;
    }
    
    try {
      const functions = getFunctions();
      const sendEmailFunction = httpsCallable(functions, 'sendTaskDelegationEmail');
      
      const payload = {
        delegatedToEmail: delegatedMember.email,
        delegatedToName: delegatedMember.name,
        taskTitle: task.title,
        delegatedByName: user.displayName || user.email,
      };
      
      toast({
        title: "Enviando correo...",
        description: `Se está enviando la notificación a ${delegatedMember.name}.`,
      });

      console.log('[sendTaskDelegationEmail] Iniciando envío de correo de delegación', payload);
      const result: any = await sendEmailFunction(payload);

      if (!result.data.success) {
        throw new Error(result.data.message || 'La Cloud Function reportó un error.');
      }
      
      console.log('[sendTaskDelegationEmail] Correo de delegación enviado correctamente', { result });
      toast({
        title: "Notificación de prueba enviada",
        description: `Se ha enviado la notificación a ${delegatedMember.name} sobre la tarea.`,
      });

    } catch (error: any) {
       console.error('[sendTaskDelegationEmail] Error al enviar correo de delegación', {
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
       });
       toast({
        variant: "destructive",
        title: "Error al notificar",
        description: "No se pudo enviar el correo de notificación. " + error.message,
      });
    }
  };

  const handleStatusChange = (newStatus: TaskStatus) => {
    updateTask(task.id, { status: newStatus });
  }
  
  const handleDelegation = (status: 'accepted' | 'rejected') => {
    updateTask(task.id, { delegationStatus: status });
  };

  const handleCompleteTask = () => {
    updateTask(task.id, { status: 'completado', progress: 100 });
  }

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

  return (
    <Card
      className="group relative border-l-4"
      style={{ borderLeftColor: getPriorityColor(task.priority) }}
    >
      <CardContent className="p-4">
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
                    onClick={() => onEdit(task)}
                    title="Editar tarea"
                >
                    <Edit size={16} />
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
                 <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-blue-500"
                    onClick={handleTestEmail}
                    title="Probar envío de correo"
                >
                    <Mail size={16} />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteTask(task.id)}
                    title="Eliminar tarea"
                >
                    <Trash2 size={16} />
                </Button>
            </div>
            <h4 className="col-span-2 mt-1 font-bold text-foreground break-words min-w-0">
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

        <div className="flex justify-between items-center text-xs mt-2">
          <div className="flex items-center gap-2">
            {task.delegateToId && delegatedMember ? (
              <Badge variant="secondary">Delegado: {delegatedMember.name}</Badge>
            ) : (
             totalFocusTimeMs > 0 && (
                <div className="flex items-center gap-1 text-muted-foreground font-medium">
                  <Clock size={12} />
                  <span>{formatFocusTime(totalFocusTimeMs)}</span>
                </div>
              )
            )}
          </div>
          {task.dueDate && (
            <div
              className={`flex items-center gap-1 ${
                isPast(new Date(task.dueDate)) && task.status !== 'completado'
                  ? 'text-destructive font-bold'
                  : 'text-muted-foreground'
              }`}
            >
              <Calendar size={12} />
              <span>
                {new Date(task.dueDate).toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                })}
              </span>
            </div>
          )}
        </div>
        
        {task.status !== 'completado' && !isDelegationPending && (
             <div className="mt-3 pt-3 border-t flex justify-between text-xs text-muted-foreground">
                <Button variant="link" size="sm" className="p-0 h-auto" disabled={task.status === 'pendiente'} onClick={() => handleStatusChange('pendiente')}>← Pendiente</Button>
                <Button variant="link" size="sm" className="p-0 h-auto" disabled={task.status === 'en-progreso'} onClick={() => handleStatusChange('en-progreso')}>En Progreso →</Button>
                <Button variant="link" size="sm" className="p-0 h-auto" disabled={task.status === 'cierre'} onClick={() => handleStatusChange('cierre')}>Cierre →</Button>
            </div>
        )}
      </CardContent>
    </Card>
  );
}
