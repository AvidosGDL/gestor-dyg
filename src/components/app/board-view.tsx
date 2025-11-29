'use client';

import React from 'react';
import { ListTodo } from 'lucide-react';
import { useTasks } from '@/contexts/tasks-context';
import type { Task, TaskStatus } from '@/lib/types';
import TaskCard from './task-card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface BoardViewProps {
  setActiveTaskForPomodoro: (task: Task | null) => void;
}

const columns: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'backlog', label: 'Backlog', color: 'border-t-gray-400' },
  { id: 'prospecting', label: 'Pendiente', color: 'border-t-blue-500' },
  { id: 'negotiation', label: 'En Progreso', color: 'border-t-amber-500' },
  { id: 'closing', label: 'Cierre / Urgente', color: 'border-t-rose-500' },
  { id: 'done', label: 'Completado', color: 'border-t-emerald-500' },
];

const TaskColumn = ({
  status,
  label,
  color,
  tasks,
  setActiveTaskForPomodoro,
}: {
  status: TaskStatus;
  label: string;
  color: string;
  tasks: Task[];
  setActiveTaskForPomodoro: (task: Task | null) => void;
}) => {
  const columnTasks = tasks.filter((t) => t.status === status);

  return (
    <div className="min-w-[320px] w-[320px] flex flex-col bg-muted/50 rounded-xl">
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

export default function BoardView({ setActiveTaskForPomodoro }: BoardViewProps) {
  const { tasks } = useTasks();

  return (
    <div className="h-full">
      <ScrollArea className="h-full whitespace-nowrap">
        <div className="flex gap-4 pb-4 h-full">
          {columns.map((col) => (
            <TaskColumn
              key={col.id}
              status={col.id}
              label={col.label}
              color={col.color}
              tasks={tasks}
              setActiveTaskForPomodoro={setActiveTaskForPomodoro}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
