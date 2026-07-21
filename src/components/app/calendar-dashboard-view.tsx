'use client';

import React, { useState, useMemo } from 'react';
import { useTasks } from '@/contexts/tasks-context';
import type { Task, TeamMember } from '@/lib/types';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isPast, parseISO, addMonths, subMonths, isToday, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, ChevronRight, AlertCircle, Calendar as CalendarIcon, List as ListIcon, CheckCircle2, Clock, UserCheck, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';
import EditTaskDialog from './edit-task-dialog';

interface CalendarDashboardViewProps {
  taskFilter: string;
}

export default function CalendarDashboardView({ taskFilter }: CalendarDashboardViewProps) {
  const { tasks } = useTasks();
  const { user } = useUser();
  const firestore = useFirestore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);

  // Fetch team members for avatars in delegation
  const myTeamCollectionRef = useMemoFirebase(() => {
    return user ? collection(firestore, `users/${user.uid}/teamMembers`) : null;
  }, [user, firestore]);
  const { data: members } = useCollection<TeamMember>(myTeamCollectionRef);

  const filteredTasks = useMemo(() => {
    if (!user) return [];
    
    let result = tasks;

    // Filter by person (TaskFilter)
    if (taskFilter === 'me') {
        result = tasks.filter(t => (t.ownerId === user.uid && !t.delegateToId) || (t.delegateToId === user.uid));
    } else if (taskFilter !== 'all') {
        result = tasks.filter(t => (t.ownerId === taskFilter && !t.delegateToId) || (t.delegateToId === taskFilter));
    } else {
        result = tasks.filter(t => t.ownerId === user.uid || t.delegateToId === user.uid);
    }

    // Only show tasks with due date for the calendar view
    return result.filter(t => !!t.dueDate);
  }, [tasks, user, taskFilter]);

  const overdueTasks = useMemo(() => {
    return filteredTasks.filter(t => 
        t.status !== 'completado' && 
        isPast(parseISO(t.dueDate)) && 
        !isSameDay(parseISO(t.dueDate), new Date())
    );
  }, [filteredTasks]);

  const upcomingTasks = useMemo(() => {
    const today = new Date();
    const nextWeek = addMonths(today, 1); // Range for list view
    return filteredTasks.filter(t => {
        const date = parseISO(t.dueDate);
        return t.status !== 'completado' && !isPast(date) || isToday(date);
    }).sort((a, b) => parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime());
  }, [filteredTasks]);

  // Performance stats for the person filter
  const performanceStats = useMemo(() => {
    const completed = filteredTasks.filter(t => t.status === 'completado');
    const onTime = completed.filter(t => {
        if (!t.updatedAt) return true;
        return parseISO(t.updatedAt) <= parseISO(t.dueDate);
    }).length;

    return {
        total: filteredTasks.length,
        completed: completed.length,
        pending: filteredTasks.filter(t => t.status !== 'completado').length,
        overdue: overdueTasks.length,
        onTimeRate: completed.length > 0 ? Math.round((onTime / completed.length) * 100) : 100
    };
  }, [filteredTasks, overdueTasks]);

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const getTasksForDay = (day: Date) => {
    return filteredTasks.filter(t => isSameDay(parseISO(t.dueDate), day));
  };

  const getMemberInfo = (uid: string | null) => {
    if (!uid) return null;
    return members?.find(m => m.uid === uid) || null;
  };

  return (
    <div className="h-full flex flex-col gap-6 p-1">
      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Cumplimiento</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">{performanceStats.onTimeRate}%</span>
                    <TrendingUp className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Tareas entregadas a tiempo</p>
            </CardContent>
        </Card>
        <Card className="bg-rose-500/5 border-rose-500/20">
            <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Vencidas</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-rose-600">{performanceStats.overdue}</span>
                    <AlertCircle className="h-5 w-5 text-rose-500" />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Requieren atención inmediata</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Pendientes</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">{performanceStats.pending}</span>
                    <Clock className="h-5 w-5 text-amber-500" />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Tareas activas en calendario</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Completadas</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">{performanceStats.completed}</span>
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Éxitos registrados</p>
            </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="calendar" value={viewMode} onValueChange={(v: any) => setViewMode(v)} className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-4">
            <TabsList>
                <TabsTrigger value="calendar" className="gap-2">
                    <CalendarIcon size={16} /> Calendario
                </TabsTrigger>
                <TabsTrigger value="list" className="gap-2">
                    <ListIcon size={16} /> Listado Detallado
                </TabsTrigger>
            </TabsList>

            {viewMode === 'calendar' && (
                <div className="flex items-center gap-4 bg-muted p-1 rounded-lg">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}><ChevronLeft size={18}/></Button>
                    <span className="text-sm font-bold min-w-[120px] text-center capitalize">
                        {format(currentDate, 'MMMM yyyy', { locale: es })}
                    </span>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}><ChevronRight size={18}/></Button>
                </div>
            )}
        </div>

        <TabsContent value="calendar" className="flex-1 min-h-0">
            <Card className="h-full flex flex-col overflow-hidden">
                <CardContent className="p-0 flex-1 flex flex-col">
                    <div className="grid grid-cols-7 border-b bg-muted/50">
                        {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
                            <div key={d} className="py-2 text-center text-xs font-bold text-muted-foreground">{d}</div>
                        ))}
                    </div>
                    <div className="flex-1 grid grid-cols-7 auto-rows-fr">
                        {monthDays.map((day, idx) => {
                            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                            const dayTasks = getTasksForDay(day);
                            
                            return (
                                <div 
                                    key={idx} 
                                    className={cn(
                                        "border-r border-b p-1 flex flex-col gap-1 min-h-[100px]",
                                        !isCurrentMonth && "bg-muted/20 opacity-50",
                                        isToday(day) && "bg-primary/5"
                                    )}
                                >
                                    <div className="flex justify-between items-center mb-1">
                                        <span className={cn(
                                            "text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full",
                                            isToday(day) ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                                        )}>
                                            {format(day, 'd')}
                                        </span>
                                    </div>
                                    <ScrollArea className="flex-1">
                                        <div className="flex flex-col gap-1 pr-1">
                                            {dayTasks.map(task => {
                                                const isVencida = task.status !== 'completado' && isPast(parseISO(task.dueDate)) && !isToday(parseISO(task.dueDate));
                                                const isDone = task.status === 'completado';
                                                
                                                return (
                                                    <div 
                                                        key={task.id}
                                                        onClick={() => setTaskToEdit(task)}
                                                        className={cn(
                                                            "text-[9px] p-1 rounded-sm cursor-pointer truncate font-medium border-l-2 transition-colors",
                                                            isDone ? "bg-emerald-50 text-emerald-700 border-l-emerald-500 line-through opacity-70" :
                                                            isVencida ? "bg-rose-50 text-rose-700 border-l-rose-500" :
                                                            "bg-blue-50 text-blue-700 border-l-blue-500"
                                                        )}
                                                    >
                                                        {task.title}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </ScrollArea>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="list" className="flex-1 overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                {/* VENCIDAS */}
                <Card className="flex flex-col overflow-hidden border-rose-200">
                    <CardHeader className="bg-rose-50/50 pb-4 border-b">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="text-rose-500" size={20} />
                            <CardTitle className="text-base text-rose-700 uppercase tracking-tight">Vencidas e Incumplidas</CardTitle>
                        </div>
                        <CardDescription className="text-xs">Tareas que ya pasaron su fecha límite sin completarse.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 flex-1 overflow-hidden">
                        <ScrollArea className="h-full">
                            <div className="p-4 space-y-3">
                                {overdueTasks.length === 0 ? (
                                    <div className="text-center py-10 text-muted-foreground text-xs italic">No hay tareas vencidas. ¡Buen trabajo!</div>
                                ) : (
                                    overdueTasks.map(task => {
                                        const delegate = getMemberInfo(task.delegateToId);
                                        return (
                                            <div 
                                                key={task.id} 
                                                className="group flex flex-col gap-2 p-3 bg-rose-50/30 border border-rose-100 rounded-xl hover:border-rose-300 transition-all cursor-pointer"
                                                onClick={() => setTaskToEdit(task)}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <h4 className="text-sm font-bold text-rose-900 flex-1 pr-2 line-clamp-2">{task.title}</h4>
                                                    <Badge variant="destructive" className="text-[10px] whitespace-nowrap">
                                                        Venció el {format(parseISO(task.dueDate), 'dd/MM')}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center justify-between mt-1">
                                                    <div className="flex items-center gap-2">
                                                        {delegate ? (
                                                            <div className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded-full border shadow-sm">
                                                                <Avatar className="h-5 w-5">
                                                                    <AvatarImage src={delegate.avatarUrl} />
                                                                    <AvatarFallback>{delegate.name[0]}</AvatarFallback>
                                                                </Avatar>
                                                                <span className="text-[10px] font-bold text-muted-foreground">{delegate.name}</span>
                                                            </div>
                                                        ) : (
                                                            <Badge variant="outline" className="text-[9px] uppercase">Personal</Badge>
                                                        )}
                                                        <span className="text-[10px] text-muted-foreground font-mono">{task.client}</span>
                                                    </div>
                                                    <div className="text-[10px] font-bold text-rose-600 bg-white px-2 py-0.5 rounded border">
                                                        {task.status}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>

                {/* PRÓXIMAS */}
                <Card className="flex flex-col overflow-hidden border-blue-200">
                    <CardHeader className="bg-blue-50/50 pb-4 border-b">
                        <div className="flex items-center gap-2">
                            <Clock className="text-blue-500" size={20} />
                            <CardTitle className="text-base text-blue-700 uppercase tracking-tight">Próximos Vencimientos</CardTitle>
                        </div>
                        <CardDescription className="text-xs">Compromisos pendientes para hoy y días siguientes.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 flex-1 overflow-hidden">
                        <ScrollArea className="h-full">
                            <div className="p-4 space-y-3">
                                {upcomingTasks.length === 0 ? (
                                    <div className="text-center py-10 text-muted-foreground text-xs italic">No hay vencimientos próximos registrados.</div>
                                ) : (
                                    upcomingTasks.map(task => {
                                        const delegate = getMemberInfo(task.delegateToId);
                                        const isDueToday = isToday(parseISO(task.dueDate));
                                        return (
                                            <div 
                                                key={task.id} 
                                                className={cn(
                                                    "group flex flex-col gap-2 p-3 border rounded-xl hover:border-blue-400 transition-all cursor-pointer",
                                                    isDueToday ? "bg-amber-50/50 border-amber-200" : "bg-blue-50/20 border-blue-100"
                                                )}
                                                onClick={() => setTaskToEdit(task)}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <h4 className="text-sm font-bold text-foreground flex-1 pr-2 line-clamp-2">{task.title}</h4>
                                                    <Badge variant={isDueToday ? "default" : "outline"} className={cn("text-[10px] whitespace-nowrap", isDueToday ? "bg-amber-500" : "text-blue-600 border-blue-200")}>
                                                        {isDueToday ? 'VENCE HOY' : format(parseISO(task.dueDate), 'dd/MM/yyyy')}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center justify-between mt-1">
                                                    <div className="flex items-center gap-2">
                                                        {delegate ? (
                                                            <div className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded-full border shadow-sm">
                                                                <Avatar className="h-5 w-5">
                                                                    <AvatarImage src={delegate.avatarUrl} />
                                                                    <AvatarFallback>{delegate.name[0]}</AvatarFallback>
                                                                </Avatar>
                                                                <span className="text-[10px] font-bold text-muted-foreground">{delegate.name}</span>
                                                            </div>
                                                        ) : (
                                                            <Badge variant="outline" className="text-[9px] uppercase">Personal</Badge>
                                                        )}
                                                        <span className="text-[10px] text-muted-foreground font-mono">{task.client}</span>
                                                    </div>
                                                    <div className="text-[10px] font-bold text-blue-600 bg-white px-2 py-0.5 rounded border">
                                                        {task.progress}% - {task.status}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </TabsContent>
      </Tabs>

      {taskToEdit && (
        <EditTaskDialog
            open={!!taskToEdit}
            onOpenChange={(o) => !o && setTaskToEdit(null)}
            task={taskToEdit}
        />
      )}
    </div>
  );
}