'use client';

import React from 'react';
import {
  Briefcase,
  Calendar,
  Timer,
  Trash2,
} from 'lucide-react';
import { useTasks } from '@/contexts/tasks-context';
import type { Task, TaskStatus } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isPast } from 'date-fns';

interface TaskCardProps {
  task: Task;
  setActiveTaskForPomodoro: (task: Task | null) => void;
}

const getPriorityColor = (p: Task['priority']) => {
  if (p === 'high') return '#ef4444'; // rose-500
  if (p === 'medium') return '#f59e0b'; // amber-500
  return '#3b82f6'; // blue-500
};

const getProbabilityColor = (prob: number) => {
  if (prob >= 80) return 'bg-emerald-500';
  if (prob >= 50) return 'bg-amber-500';
  return 'bg-rose-500';
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function TaskCard({ task, setActiveTaskForPomodoro }: TaskCardProps) {
  const { deleteTask, updateTask } = useTasks();

  const handleStatusChange = (newStatus: TaskStatus) => {
    updateTask(task.id, { status: newStatus });
  }

  return (
    <Card
      className="group relative border-l-4"
      style={{ borderLeftColor: getPriorityColor(task.priority) }}
    >
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <h4 className="font-bold text-foreground leading-tight pr-14">{task.title}</h4>
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
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
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </div>

        <div className="flex items-center text-sm text-muted-foreground mb-3 gap-2">
          <Briefcase size={14} />
          <span className="font-medium">{task.client || 'Sin Cliente'}</span>
        </div>

        <div className="bg-muted/50 rounded-lg p-2 mb-3 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground block mb-1">Valor Est.</span>
            <span className="font-mono font-bold text-foreground">
              {formatCurrency(task.value)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block mb-1">Probabilidad</span>
            <div className="flex items-center gap-1.5">
              <div className="w-full bg-border h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getProbabilityColor(task.probability)}`}
                  style={{ width: `${task.probability}%` }}
                ></div>
              </div>
              <span className="font-bold text-foreground text-right w-8">
                {task.probability}%
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center text-xs mt-2">
          <div className="flex items-center gap-2">
            {task.delegateTo ? (
              <Badge variant="secondary">Delegado: {task.delegateTo}</Badge>
            ) : (
              <span className="text-muted-foreground italic">Sin delegar</span>
            )}
          </div>
          {task.dueDate && (
            <div
              className={`flex items-center gap-1 ${
                isPast(new Date(task.dueDate)) && task.status !== 'done'
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
        
        {task.status !== 'backlog' && task.status !== 'done' && (
             <div className="mt-3 pt-3 border-t flex justify-between text-xs text-muted-foreground">
                <Button variant="link" size="sm" className="p-0 h-auto" disabled={task.status === 'prospecting'} onClick={() => handleStatusChange('prospecting')}>← Prospecto</Button>
                <Button variant="link" size="sm" className="p-0 h-auto" disabled={task.status === 'negotiation'} onClick={() => handleStatusChange('negotiation')}>Negociar →</Button>
                <Button variant="link" size="sm" className="p-0 h-auto" disabled={task.status === 'closing'} onClick={() => handleStatusChange('closing')}>Cierre →</Button>
            </div>
        )}
      </CardContent>
    </Card>
  );
}
