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
} from 'lucide-react';
import { useTasks } from '@/contexts/tasks-context';
import type { Task, TaskStatus } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isPast } from 'date-fns';
import type { TeamMember } from '@/lib/types';
import { useCollection, useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';

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

const formatFocusTime = (minutes: number) => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

export default function TaskCard({ task, setActiveTaskForPomodoro, onEdit }: TaskCardProps) {
  const { deleteTask, updateTask } = useTasks();
  const { user } = useUser();
  const firestore = useFirestore();

  const collectionPath = user ? `users/${user.uid}/teamMembers` : null;
  const membersCollectionRef = useMemoFirebase(() => {
    return collectionPath ? collection(firestore, collectionPath) : null;
  }, [collectionPath, firestore]);
  const { data: members } = useCollection<TeamMember>(membersCollectionRef);

  const handleStatusChange = (newStatus: TaskStatus) => {
    updateTask(task.id, { status: newStatus });
  }

  const handleCompleteTask = () => {
    updateTask(task.id, { status: 'completado', progress: 100 });
  }

  const totalFocusMinutes = React.useMemo(() => {
    return task.focusSessions?.reduce((total, session) => total + session.duration, 0) || 0;
  }, [task.focusSessions]);

  const delegatedMember = members?.find(m => m.name === task.delegateTo);


  return (
    <Card
      className="group relative border-l-4"
      style={{ borderLeftColor: getPriorityColor(task.priority) }}
    >
      <CardContent className="p-4">
        <div className="grid grid-cols-[1fr_auto] items-start gap-2 mb-2">
          <h4 className="font-bold text-foreground min-w-0 break-words">
            {task.title}
          </h4>
          <div className="flex gap-1 shrink-0">
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
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => deleteTask(task.id)}
               title="Eliminar tarea"
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </div>

        <div className="flex items-center text-sm text-muted-foreground mb-3 gap-2">
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
            {task.delegateTo ? (
              <Badge variant="secondary">Delegado: {task.delegateTo}</Badge>
            ) : (
             totalFocusMinutes > 0 && (
                <div className="flex items-center gap-1 text-muted-foreground font-medium">
                  <Clock size={12} />
                  <span>{formatFocusTime(totalFocusMinutes)}</span>
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
                {new Date(task.dueDate).toLocaleDateString('es-MX', {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            </div>
          )}
        </div>
        
        {task.status !== 'completado' && (
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
