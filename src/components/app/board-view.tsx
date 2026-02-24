'use client';

import React, { useState, useMemo } from 'react';
import { ListTodo, Bell, Trash2, CheckCheck, MessageSquare, ArrowRightLeft, Search } from 'lucide-react';
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { cn } from '@/lib/utils';

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
  const { tasks, updateTask, bulkUpdateTasks } = useTasks();
  const { user } = useUser();
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeStatusFilter, setActiveStatusFilter] = useState<TaskStatus | 'all'>('all');

  const handleEditTask = (task: Task) => {
    if (user && user.uid === task.ownerId) {
      const lastOwnerView = task.lastOwnerUpdateTimestamp ? new Date(task.lastOwnerUpdateTimestamp).getTime() : 0;
      const lastUpdate = task.updatedAt ? new Date(task.updatedAt).getTime() : 0;
      if (lastUpdate > lastOwnerView) {
        updateTask(task.id, { lastOwnerUpdateTimestamp: new Date().toISOString() }, user, []);
      }
    }
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

    let tasksToShow = tasks;

    if (taskFilter === 'me' || taskFilter === user.uid) {
        tasksToShow = tasks.filter(t => (t.ownerId === user.uid && !t.delegateToId) || (t.delegateToId === user.uid));
    } else if (taskFilter === 'all') {
        tasksToShow = tasks.filter(t => t.ownerId === user.uid);
    } else {
        tasksToShow = tasks.filter(t => (t.ownerId === taskFilter && !t.delegateToId) || (t.delegateToId === taskFilter));
    }

    if (activeStatusFilter !== 'all') {
        tasksToShow = tasksToShow.filter(t => t.status === activeStatusFilter);
    }

    if (searchTerm.trim() !== '') {
        tasksToShow = tasksToShow.filter(t => t.title.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    return tasksToShow;
}, [tasks, user, taskFilter, searchTerm, activeStatusFilter]);

  const delegatedToMe = useMemo(() => {
    if(!user) return [];
    return tasks.filter(t => t.delegateToId === user.uid && t.delegationStatus === 'pending')
  }, [tasks, user]);
  
  const notifications = useMemo(() => {
    if (!user) return [];
    return tasks
      .filter((task) => task.ownerId === user.uid && task.delegateToId)
      .map((task) => {
        if (task.notificationDismissed) return null;

        if (task.delegationStatus === 'rejected') {
          return { task, type: 'rejected', message: `La tarea fue rechazada por la persona a la que se delegó.` };
        }

        if (task.status === 'completado') {
          return { task, type: 'completed', message: `La tarea delegada ha sido completada.` };
        }

        const lastOwnerView = task.lastOwnerUpdateTimestamp ? new Date(task.lastOwnerUpdateTimestamp).getTime() : 0;
        const lastUpdate = task.updatedAt ? new Date(task.updatedAt).getTime() : 0;

        if (lastUpdate > lastOwnerView) {
            if (task.status === 'en-progreso' || task.status === 'cierre') {
                 return { task, type: 'status_change', message: `El estado de la tarea cambió a: ${task.status}.` };
            }
            const hasNewComment = (task.completionComment?.length || 0) > 0;
            const hasNewAttachment = (task.attachments?.length || 0) > 0;
            if (hasNewComment || hasNewAttachment) {
                return { task, type: 'comment', message: `Se añadió un nuevo comentario o archivo adjunto.` };
            }
        }
        
        return null;
      })
      .filter(Boolean) as { task: Task; type: string; message: string }[];
  }, [tasks, user]);


  const dismissNotification = (task: Task) => {
    if (task.delegationStatus === 'rejected') {
        updateTask(task.id, { delegateToId: null, delegatedByName: null, delegationStatus: null, delegateToEmail: null }, user);
    } else if (task.status === 'completado') {
        updateTask(task.id, { notificationDismissed: true }, user);
    } else {
        updateTask(task.id, { lastOwnerUpdateTimestamp: new Date().toISOString() }, user);
    }
  };

  const handleDismissAll = () => {
    if (notifications.length === 0) return;

    const updates = notifications.map(({ task }) => {
        if (task.delegationStatus === 'rejected') {
            return { id: task.id, changes: { delegateToId: null, delegatedByName: null, delegationStatus: null, delegateToEmail: null } };
        }
        if (task.status === 'completado') {
            return { id: task.id, changes: { notificationDismissed: true } };
        }
        return { id: task.id, changes: { lastOwnerUpdateTimestamp: new Date().toISOString() }};
    });

    bulkUpdateTasks(updates, user);
    toast({
        title: "Notificaciones descartadas",
        description: "Se han limpiado todas las notificaciones."
    })
  };

  const renderNotificationIcon = (type: string) => {
    switch (type) {
      case 'rejected': return <Badge variant="destructive" className="mr-2">Rechazada</Badge>;
      case 'completed': return <Badge className="bg-emerald-500 mr-2">Completada</Badge>;
      case 'status_change': return <Badge variant="secondary" className="mr-2"><ArrowRightLeft size={12} className="mr-1"/> Estado</Badge>;
      case 'comment': return <Badge variant="secondary" className="mr-2"><MessageSquare size={12} className="mr-1"/> Comentario</Badge>;
      default: return null;
    }
  }

  const columnsToShow = useMemo(() => {
    if (activeStatusFilter === 'all') {
      return columns;
    }
    return columns.filter(col => col.id === activeStatusFilter);
  }, [activeStatusFilter]);

  const liveTask = useMemo(() => {
    if (!taskToEdit) return null;
    return tasks.find(t => t.id === taskToEdit.id) || taskToEdit;
  }, [tasks, taskToEdit]);

  return (
    <>
      <div className="h-full flex flex-col gap-4">
        <div className="flex-shrink-0 flex flex-wrap items-center gap-4">
           <div className="flex items-center gap-2">
            <Button
                variant={activeStatusFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveStatusFilter('all')}
              >
                Todas
              </Button>
            {columns.map(col => (
               <Button
                key={col.id}
                variant={activeStatusFilter === col.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveStatusFilter(col.id)}
              >
                {col.label}
              </Button>
            ))}
           </div>
           <div className="relative flex-grow min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
             <Input
                placeholder="Buscar por título..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
           </div>
        </div>

        { (delegatedToMe.length > 0 || notifications.length > 0) &&
          <div className="flex-shrink-0">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle className="text-lg flex items-center gap-2"><Bell size={20} className="text-primary"/> Notificaciones</CardTitle>
               {(notifications.length > 0) && (
                <Button variant="ghost" size="sm" onClick={handleDismissAll}>
                  <CheckCheck size={16} className="mr-2" />
                  Descartar Todas
                </Button>
              )}
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
               {notifications.map(({ task, type, message }) => (
                  <div key={task.id + type} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm flex items-center">
                        {renderNotificationIcon(type)}
                        <span className="italic mr-1">"{task.title}":</span>
                        <span className="ml-1">{message}</span>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => dismissNotification(task)}>Descartar</Button>
                  </div>
                ))}
            </CardContent>
          </Card>
          </div>
        }
        <ScrollArea className="flex-1 -mx-4">
          <div className={cn(
            "px-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 pb-4",
            activeStatusFilter !== 'all' && "xl:grid-cols-1"
          )}>
            {columnsToShow.map((col) => (
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
      {liveTask && (
        <EditTaskDialog
          open={isEditDialogOpen}
          onOpenChange={handleCloseDialog}
          task={liveTask}
        />
      )}
    </>
  );
}