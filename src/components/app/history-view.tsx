
'use client';

import React, { useState, useMemo } from 'react';
import { ListTodo, Archive } from 'lucide-react';
import { useHistory } from '@/contexts/history-context';
import type { Task, TaskStatus } from '@/lib/types';
import HistoryTaskCard from './history-task-card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useUser } from '@/firebase';

interface HistoryViewProps {
  taskFilter: string;
}

const columns: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'pendiente', label: 'Pendiente', color: 'border-t-blue-500' },
  { id: 'en-progreso', label: 'En Progreso', color: 'border-t-amber-500' },
  { id: 'cierre', label: 'Cierre / Urgente', color: 'border-t-rose-500' },
  { id: 'completado', label: 'Completado', color: 'border-t-emerald-500' },
];

const HistoryTaskColumn = ({
  status,
  label,
  color,
  tasks,
}: {
  status: TaskStatus;
  label: string;
  color: string;
  tasks: Task[];
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
            <HistoryTaskCard
              key={task.id}
              task={task}
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

export default function HistoryView({ taskFilter }: HistoryViewProps) {
  const { historyTasks, loading } = useHistory();
  const { user } = useUser();

  const filteredTasks = useMemo(() => {
    if (!user) return [];
    
    if (taskFilter === 'me' || taskFilter === user.uid) {
      return historyTasks.filter(t => (t.ownerId === user.uid && !t.delegateToId) || (t.delegateToId === user.uid));
    } 
    
    if (taskFilter === 'all') {
      return historyTasks.filter(t => t.ownerId === user.uid);
    }
    
    return historyTasks.filter(t => (t.ownerId === taskFilter && !t.delegateToId) || (t.delegateToId === taskFilter));
  }, [historyTasks, user, taskFilter]);

  if (loading) {
    return <div className="text-center py-10">Cargando histórico...</div>
  }

  if (historyTasks.length === 0) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <Archive size={48} className="mb-4" />
            <h3 className="text-lg font-semibold">El histórico de tareas está vacío</h3>
            <p className="text-sm">Las tareas completadas y archivadas aparecerán aquí.</p>
        </div>
    )
  }

  return (
    <>
      <div className="h-full flex flex-col gap-4">
        <ScrollArea className="flex-1 -mx-4">
          <div className="px-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 pb-4">
            {columns.map((col) => (
              <HistoryTaskColumn
                key={col.id}
                status={col.id}
                label={col.label}
                color={col.color}
                tasks={filteredTasks}
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </>
  );
}
