'use client';

import React from 'react';
import {
  Briefcase,
  Calendar,
  DollarSign,
  Percent,
  Timer,
  Clock,
  UserCheck,
  User,
  Archive,
} from 'lucide-react';
import type { Task, TeamMember } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { isPast, parseISO, format } from 'date-fns';
import { useCollection, useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';


interface HistoryTaskCardProps {
  task: Task;
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

export default function HistoryTaskCard({ task }: HistoryTaskCardProps) {
  const { user } = useUser();
  const firestore = useFirestore();


  const collectionPath = user ? `users/${user.uid}/teamMembers` : null;
  const membersCollectionRef = useMemoFirebase(() => {
    return collectionPath ? collection(firestore, collectionPath) : null;
  }, [collectionPath, firestore]);
  const { data: members } = useCollection<TeamMember>(membersCollectionRef);

  const delegatedMember = members?.find(m => m.id === task.delegateToId);

  const totalFocusTimeMs = React.useMemo(() => {
    if (!task.focusSessions) return 0;
    return task.focusSessions.reduce((total, session) => {
      const start = new Date(session.startTime).getTime();
      const end = new Date(session.endTime).getTime();
      return total + (end - start);
    }, 0);
  }, [task.focusSessions]);

  return (
    <Card
      className="group relative border-l-4 flex flex-col opacity-80"
      style={{ borderLeftColor: getPriorityColor(task.priority) }}
    >
      <CardContent className="p-4 flex-1">
        <div className="grid grid-cols-[1fr_auto] items-start gap-x-2">
            <div></div>
            <div className='flex items-center gap-1 text-muted-foreground'>
                <Archive size={14} />
                <span className='text-xs font-semibold'>Archivado</span>
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

        <div className="flex flex-col space-y-2 text-xs mt-2">
            <div className="flex justify-between items-center">
                <div className="flex flex-col gap-2 items-start">
                    {task.delegateToId && delegatedMember && (
                        <Badge variant="secondary" className="flex items-center gap-1.5">
                            <UserCheck size={12} />
                            Delegado a: {delegatedMember.name}
                        </Badge>
                    )}
                    {task.delegatedByName && (
                        <Badge className="flex items-center gap-1.5 bg-sky-500/20 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400 border-sky-500/30 hover:bg-sky-500/30">
                            <User size={12} />
                            Delegada por: {task.delegatedByName}
                        </Badge>
                    )}
                    {totalFocusTimeMs > 0 && !task.delegateToId && (
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
      </CardContent>
    </Card>
  );
}
