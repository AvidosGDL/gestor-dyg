'use client';

import React, { useState, useMemo } from 'react';
import { ListTodo, Bell } from 'lucide-react';
import { useTasks } from '@/contexts/tasks-context';
import type { Task, TaskStatus } from '@/lib/types';
import TaskCard from './task-card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import EditTaskDialog from './edit-task-dialog';
import { useUser } from '@/firebase';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { toast } from '@/hooks/use-toast';

interface BoardViewProps {
  setActiveTaskForPomodoro: (task: Task | null) => void;
  taskFilter: string;
}

const columns: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'pendiente', label: 'Pendiente', color: 'border-t-blue-500' },
  { id: 'en-progreso', label: 'En Progreso', color: 'border-t-amber-500' },
  { id: 'cierre', label: 'Cierre / Urgente', color: 'border-t-rose-500' },
  { id: 'completado', label: 'Completado', color: 'border-t-emerald-500' },
];

const TaskColumn = ({
  status,
  label,
  color,
  tasks,
  setActiveTaskForPomodoro,
  onEditTask,
}: {
  status: TaskStatus;
  label: string;
  color: string;
  tasks: Task[];
  setActiveTaskForPomodoro: (task: Task | null) => void;
  onEditTask: (task: Task) => void;
}) => {
  const columnTasks = tasks.filter((t) => t.status === status);

  return (
    <div className="w-full flex flex-col bg-muted/50 rounded-xl">
      <div
        className={`p-3 bg-card rounded-t-xl border-t-4 shadow-sm ${color} sticky top-0 z-10`}
      >
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-bold text-foreground">{label}</h3>
          <span className="bg-muted text-muted-foreground text-xs px-2 py-1 rounded-full font-medium">
            {columnTasks.length}
          </span>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {columnTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              setActiveTaskForPomodoro={setActiveTaskForPomodoro}
              onEdit={onEditTask}
            />
          ))}
          {columnTasks.length === 0 && (
            <div className="text-center py-10 text-muted-foreground/60">
              <ListTodo className="mx-auto mb-2" />
              <p className="text-sm">Sin tareas</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default function BoardView({ setActiveTaskForPomodoro, taskFilter }: BoardViewProps) {
  const { tasks, updateTask } = useTasks();
  const { user } = useUser();
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
  
  const handleDelegation = (taskId: string, status: 'accepted' | 'rejected') => {
    updateTask(taskId, { delegationStatus: status }, user);
    toast({
      title: `Tarea ${status === 'accepted' ? 'aceptada' : 'rechazada'}`,
      description: `Has ${status === 'accepted' ? 'aceptado' : 'rechazado'} la tarea.`,
    })
  };

  const filteredTasks = useMemo(() => {
    if (!user) return [];
    
    // "Mis Tareas" = Tareas que me pertenecen Y NO HE DELEGADO, o tareas que me HAN DELEGADO a mí.
    if (taskFilter === 'me' || taskFilter === user.uid) {
      return tasks.filter(t => (t.ownerId === user.uid && !t.delegateToId) || (t.delegateToId === user.uid));
    } 
    
    // "Todas las tareas" = todas las tareas que gestiona el owner (ya filtradas en el context).
    if (taskFilter === 'all') {
      return tasks.filter(t => t.ownerId === user.uid);
    }
    
    // Filtro por miembro del equipo: Tareas delegadas a ese miembro por el owner actual.
    return tasks.filter(t => t.ownerId === user.uid && t.delegateToId === taskFilter);
  }, [tasks, user, taskFilter]);

  const delegatedToMe = useMemo(() => {
    if(!user) return [];
    // Notificaciones de tareas delegadas pendientes de aceptar/rechazar por el usuario actual.
    return tasks.filter(t => t.delegateToId === user.uid && t.delegationStatus === 'pending')
  }, [tasks, user]);
  
  const notifications = useMemo(() => {
    if(!user) return [];
    // Notificaciones para el owner sobre el estado de sus tareas delegadas.
    return tasks.filter(t => t.ownerId === user.uid && (t.delegationStatus === 'rejected' || (t.status === 'completado' && t.delegateToId !== null)));
  }, [tasks, user]);

  const dismissNotification = (task: Task) => {
    if (task.delegationStatus === 'rejected') {
        // Al descartar, se quita la delegación para que no vuelva a aparecer.
        updateTask(task.id, { delegateToId: null, delegatedByName: null, delegationStatus: null }, user);
    }
    if (task.status === 'completado' && task.delegateToId) {
        // Simplemente se podría "archivar" la notificación, aquí la eliminamos para simplicidad.
        // En una app real, podría ser un campo "notificationDismissed: true".
        console.log("Acknowledging completed task:", task.id);
        // Para este ejemplo, no se hace nada, pero la tarea ya no aparecerá si se mueve de "completado".
    }
};


  return (
    <>
      <div className="h-full flex flex-col gap-4">
        { (delegatedToMe.length > 0 || notifications.length > 0) &&
          <div className="flex-shrink-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Bell size={20} className="text-primary"/> Notificaciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {delegatedToMe.map(task => (
                <div key={task.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm"><span className="font-bold">{task.delegatedByName}</span> te ha delegado la tarea: <span className="italic">"{task.title}"</span></p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleDelegation(task.id, 'accepted')}>Aceptar</Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelegation(task.id, 'rejected')}>Rechazar</Button>
                  </div>
                </div>
              ))}
               {notifications.map(task => (
                  <div key={task.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    {task.delegationStatus === 'rejected' && <p className="text-sm">La tarea <span className="italic">"{task.title}"</span> fue <span className="font-bold text-destructive">rechazada</span> por la persona a la que se delegó.</p>}
                    {task.status === 'completado' && task.delegateToId && <p className="text-sm">La tarea delegada <span className="italic">"{task.title}"</span> ha sido <span className="font-bold text-emerald-500">completada</span>.</p>}
                    <Button size="sm" variant="ghost" onClick={() => dismissNotification(task)}>Descartar</Button>
                  </div>
                ))}
            </CardContent>
          </Card>
          </div>
        }
        <ScrollArea className="h-full">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pb-4 h-full">
            {columns.map((col) => (
              <TaskColumn
                key={col.id}
                status={col.id}
                label={col.label}
                color={col.color}
                tasks={filteredTasks}
                setActiveTaskForPomodoro={setActiveTaskForPomodoro}
                onEditTask={handleEditTask}
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
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
