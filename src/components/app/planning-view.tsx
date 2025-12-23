
'use client';

import React, { useState, useMemo } from 'react';
import {
  Calendar,
  TrendingUp,
  Sparkles,
  Edit,
} from 'lucide-react';
import { useTasks } from '@/contexts/tasks-context';
import type { Task } from '@/lib/types';
import PomodoroTimer from './pomodoro-timer';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { prioritizeTasks } from '@/ai/flows/prioritize-tasks';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EditTaskDialog from './edit-task-dialog';
import { useUser } from '@/firebase';


interface PlanningViewProps {
  activeTaskForPomodoro: Task | null;
  setActiveTaskForPomodoro: (task: Task | null) => void;
  taskFilter: string;
}

const PipelineSummary = ({ tasks }: { tasks: Task[] }) => {
  const completedTasks = useMemo(() =>
    tasks.filter((t) => t.status === 'completado').length
  , [tasks]);
  
  const totalTasks = useMemo(() =>
    tasks.filter((t) => t.status !== 'pendiente').length
  , [tasks]);

  const overallProgress = useMemo(() => {
    const activeTasks = tasks.filter((t) => t.status !== 'completado' && t.status !== 'pendiente');
    if (activeTasks.length === 0) return 0;
    const totalProgress = activeTasks.reduce((acc, c) => acc + c.progress, 0);
    return Math.round(totalProgress / activeTasks.length);
  }, [tasks]);


  return (
    <Card className="bg-gradient-to-br from-primary to-purple-700 text-primary-foreground shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp />
          Resumen de Tareas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-primary-foreground/80">Progreso General de Tareas Activas</p>
          <p className="text-3xl font-bold">{overallProgress}%</p>
        </div>
        <div>
          <p className="text-sm text-primary-foreground/80">
            Tareas Completadas
          </p>
          <p className="text-xl font-bold opacity-90">
            {completedTasks} de {totalTasks}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};


export default function PlanningView({ activeTaskForPomodoro, setActiveTaskForPomodoro, taskFilter }: PlanningViewProps) {
  const { tasks, setTasks, updateTask } = useTasks();
  const { user } = useUser();
  const [isPrioritizing, setIsPrioritizing] = useState(false);
  const { toast } = useToast();
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const handleEditTask = (task: Task) => {
    setTaskToEdit(task);
    setIsEditDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsEditDialogOpen(false);
    setTaskToEdit(null);
  };

  const filteredTasks = useMemo(() => {
    if (!user) return [];
    
    if (taskFilter === 'me' || taskFilter === user.uid) {
        return tasks.filter(t => (t.ownerId === user.uid && !t.delegateToId) || (t.delegateToId === user.uid));
    } 
    
    if (taskFilter === 'all') {
        return tasks.filter(t => t.ownerId === user.uid);
    }
    
    return tasks.filter(t => (t.ownerId === taskFilter && !t.delegateToId) || (t.delegateToId === taskFilter));
  }, [tasks, user, taskFilter]);

  const sortedTasks = useMemo(() => {
    return [...filteredTasks]
      .filter((t) => t.status !== 'completado')
      .sort((a, b) => {
        // Sort by value (potential) descending
        if (b.value !== a.value) return b.value - a.value;

        // Then by priority
        const priorityVal = { high: 3, medium: 2, low: 1 };
        if (priorityVal[b.priority] !== priorityVal[a.priority])
          return priorityVal[b.priority] - priorityVal[a.priority];
        
        // Then by due date
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
  }, [filteredTasks]);

  const today = new Date().toISOString().split('T')[0];

  const handlePrioritize = async () => {
    setIsPrioritizing(true);
    try {
      const tasksToPrioritize = filteredTasks.map(t => ({...t}));
      const prioritized = await prioritizeTasks(tasksToPrioritize);
      
      const prioritizedIds = new Set(prioritized.map(p => p.id));
      const otherTasks = tasks.filter(t => !prioritizedIds.has(t.id));
      
      setTasks([...prioritized, ...otherTasks]);

      toast({
        title: "Tareas priorizadas con IA",
        description: "El orden de tus tareas ha sido optimizado.",
      });
    } catch (error) {
      console.error("Error prioritizing tasks:", error);
      toast({
        title: "Error de IA",
        description: "No se pudieron priorizar las tareas. Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsPrioritizing(false);
    }
  };

  return (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      <div className="lg:col-span-2 space-y-6 overflow-y-auto pr-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="text-primary" />
                Planeación del Día: {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <Button onClick={handlePrioritize} disabled={isPrioritizing} size="sm" variant="ghost">
                <Sparkles className={`mr-2 h-4 w-4 ${isPrioritizing ? 'animate-spin' : ''}`} />
                Priorizar con IA
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <div>
              <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-4">Para Hoy / Vencidas</h4>
              <div className="space-y-2">
                {sortedTasks.filter(t => t.dueDate && t.dueDate <= today).map(task => (
                  <div key={task.id} className="flex items-center justify-between p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Checkbox id={`task-${task.id}`} onCheckedChange={() => updateTask(task.id, { status: 'completado' }, user)} />
                      <div>
                        <label htmlFor={`task-${task.id}`} className="font-medium text-foreground cursor-pointer">{task.title}</label>
                        <p className="text-xs text-destructive font-bold">{task.client}</p>
                      </div>
                    </div>
                     <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditTask(task)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Badge variant="destructive">¡Prioridad!</Badge>
                    </div>
                  </div>
                ))}
                {sortedTasks.filter(t => t.dueDate && t.dueDate <= today).length === 0 && <p className="text-muted-foreground italic text-sm py-4 text-center">Nada vence hoy. ¡Excelente!</p>}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-4">Próximos Pendientes (Priorizados por Potencial)</h4>
              <div className="space-y-2">
                {sortedTasks.filter(t => !t.dueDate || t.dueDate > today).slice(0, 5).map(task => (
                  <div key={task.id} className="flex items-center justify-between p-3 bg-card border hover:border-primary/50 rounded-lg transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${task.priority === 'high' ? 'bg-destructive' : task.priority === 'medium' ? 'bg-yellow-500' : 'bg-primary'}`}></div>
                      <div>
                        <p className="font-medium text-foreground">{task.title}</p>
                        <p className="text-xs text-muted-foreground">${task.value.toLocaleString()} • {task.client} • {task.dueDate ? new Date(task.dueDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric'}) : 'Sin fecha'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                       <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditTask(task)}>
                          <Edit className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      <Button variant="link" size="sm" onClick={() => updateTask(task.id, { status: 'en-progreso' }, user)}>Mover a En Progreso</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="lg:col-span-1 space-y-6 flex flex-col">
        <div className="h-[350px]">
          <PomodoroTimer activeTask={activeTaskForPomodoro} />
        </div>
        <PipelineSummary tasks={filteredTasks} />
      </div>
    </div>
     {taskToEdit && (
        <EditTaskDialog
          open={isEditDialogOpen}
          onOpenChange={handleCloseDialog}
          task={taskToEdit}
        />
      )}
    </>
  );
}
