'use client';

import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { useTasks } from '@/contexts/tasks-context';
import { useHistory } from '@/contexts/history-context';
import { useUser } from '@/firebase';
import type { Task } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, isWithinInterval, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { TrendingUp, CheckCircle2, Clock, CalendarCheck } from 'lucide-react';
import { ChartContainer, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

type Period = 'day' | 'week' | 'month';

interface AnalyticsViewProps {
  taskFilter: string;
}

// Helper to format duration from milliseconds to a readable string like "2h 30m"
const formatDuration = (milliseconds: number) => {
  if (milliseconds < 0) return '0m';
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

const barChartConfig = {
  tareasCompletadas: {
    label: 'Completadas',
    color: 'hsl(var(--primary))',
  },
  tareasATiempo: {
    label: 'A Tiempo',
    color: 'hsl(var(--chart-2))',
  }
} satisfies ChartConfig;

const lineChartConfig = {
  tiempoEnfoque: {
    label: 'Tiempo de Enfoque (min)',
    color: 'hsl(var(--accent))',
  },
} satisfies ChartConfig;


export default function AnalyticsView({ taskFilter }: AnalyticsViewProps) {
  const { tasks, loading: tasksLoading } = useTasks();
  const { historyTasks, loading: historyLoading } = useHistory();
  const { user } = useUser();
  const [period, setPeriod] = useState<Period>('week');
  
  const loading = tasksLoading || historyLoading;

  const allTasks = useMemo(() => {
    return [...tasks, ...historyTasks];
  }, [tasks, historyTasks]);

  const filteredTasksForView = useMemo(() => {
    if (!user || loading) return [];
    
    if (taskFilter === 'me' || taskFilter === user.uid) {
      return allTasks.filter(t => (t.ownerId === user.uid && !t.delegateToId) || (t.delegateToId === user.uid));
    } 
    
    if (taskFilter === 'all') {
      return allTasks.filter(t => t.ownerId === user.uid);
    }
    
    return allTasks.filter(t => (t.ownerId === taskFilter && !t.delegateToId) || (t.delegateToId === taskFilter));
  }, [allTasks, user, taskFilter, loading]);
  
  const completedTasks = useMemo(() => {
     return filteredTasksForView.filter(t => t.status === 'completado');
  }, [filteredTasksForView]);


  const chartData = useMemo(() => {
    const now = new Date();
    let interval: Interval;
    let timeUnitFormat: string;
    let getIntervals;
    
    if (period === 'day') {
      interval = { start: subDays(now, 6), end: now };
      timeUnitFormat = 'dd/MM/yyyy';
      getIntervals = eachDayOfInterval;
    } else if (period === 'week') {
      interval = { start: subDays(now, 6 * 7), end: now };
      timeUnitFormat = "'Semana' w";
      getIntervals = (int: Interval) => eachWeekOfInterval(int, { weekStartsOn: 1 });
    } else { // month
      interval = { start: subDays(now, 365), end: now };
      timeUnitFormat = 'MMM yyyy';
      getIntervals = eachMonthOfInterval;
    }

    const timeIntervals = getIntervals(interval);

    return timeIntervals.map(date => {
      const getPeriodInterval = (d: Date) => {
          if (period === 'day') return { start: d, end: d };
          if (period === 'week') return { start: startOfWeek(d, { weekStartsOn: 1 }), end: endOfWeek(d, { weekStartsOn: 1 }) };
          return { start: startOfMonth(d), end: endOfMonth(d) };
      }
      
      const periodInterval = getPeriodInterval(date);

      const tasksInPeriod = completedTasks.filter(task => {
        if (!task.updatedAt) return false;
        const completionDate = new Date(task.updatedAt);
        return isWithinInterval(completionDate, periodInterval);
      });

      const onTimeInPeriod = tasksInPeriod.filter(t => {
        if (!t.dueDate) return true; // No due date is considered on-time
        if (!t.updatedAt) return false;
        return new Date(t.updatedAt).getTime() <= new Date(t.dueDate).getTime() + (24 * 60 * 60 * 1000 - 1); // End of day
      }).length;

      const totalTime = tasksInPeriod.reduce((acc, task) => {
        const taskTime = (task.focusSessions || []).reduce((sessionAcc, session) => {
          return sessionAcc + (new Date(session.endTime).getTime() - new Date(session.startTime).getTime());
        }, 0);
        return acc + taskTime;
      }, 0);

      return {
        name: format(date, timeUnitFormat, { locale: es }),
        tareasCompletadas: tasksInPeriod.length,
        tareasATiempo: onTimeInPeriod,
        tiempoEnfoque: totalTime / (1000 * 60), // in minutes
      };
    });
  }, [completedTasks, period]);
  
  const totalTasksCompleted = useMemo(() => chartData.reduce((acc, data) => acc + data.tareasCompletadas, 0), [chartData]);
  const totalTimeFocusedMs = useMemo(() => chartData.reduce((acc, data) => acc + (data.tiempoEnfoque * 60 * 1000), 0), [chartData]);
  const totalOnTimeTasks = useMemo(() => chartData.reduce((acc, data) => acc + data.tareasATiempo, 0), [chartData]);
  const onTimePercentage = totalTasksCompleted > 0 ? Math.round((totalOnTimeTasks / totalTasksCompleted) * 100) : 0;


  return (
    <div className="h-full overflow-y-auto space-y-6 p-1">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Resumen de Productividad</h2>
        <div>
          <Button variant={period === 'day' ? 'default' : 'outline'} onClick={() => setPeriod('day')} className="rounded-r-none">Día</Button>
          <Button variant={period === 'week' ? 'default' : 'outline'} onClick={() => setPeriod('week')} className="rounded-none">Semana</Button>
          <Button variant={period === 'month' ? 'default' : 'outline'} onClick={() => setPeriod('month')} className="rounded-l-none">Mes</Button>
        </div>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Tareas Completadas</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{totalTasksCompleted}</div>
                <p className="text-xs text-muted-foreground">En el período seleccionado</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cumplimiento de Plazos</CardTitle>
                <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{onTimePercentage}%</div>
                <p className="text-xs text-muted-foreground">{totalOnTimeTasks} de {totalTasksCompleted} tareas a tiempo</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tiempo Total de Enfoque</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{formatDuration(totalTimeFocusedMs)}</div>
                <p className="text-xs text-muted-foreground">Invertido en tareas completadas</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Productividad Promedio</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">
                    {totalTasksCompleted > 0 ? formatDuration(totalTimeFocusedMs / totalTasksCompleted) : '0m'}
                </div>
                <p className="text-xs text-muted-foreground">Tiempo promedio por tarea</p>
            </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tareas por {period === 'day' ? 'Día' : period === 'week' ? 'Semana' : 'Mes'}</CardTitle>
            <CardDescription>Comparativo de tareas completadas vs. tareas entregadas a tiempo.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={barChartConfig} className="h-[300px] w-full">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  content={<ChartTooltipContent />}
                  cursor={{ fill: 'hsl(var(--muted))' }}
                />
                <Legend />
                <Bar dataKey="tareasCompletadas" name="Completadas" fill="var(--color-tareasCompletadas)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="tareasATiempo" name="A Tiempo" fill="var(--color-tareasATiempo)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tiempo de Enfoque por {period === 'day' ? 'Día' : period === 'week' ? 'Semana' : 'Mes'}</CardTitle>
            <CardDescription>Minutos dedicados a las tareas completadas.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={lineChartConfig} className="h-[300px] w-full">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} unit="m" />
                <Tooltip
                  content={<ChartTooltipContent formatter={(value) => `${value} min`} />}
                  cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 2, strokeDasharray: '3 3' }}
                />
                <Line type="monotone" dataKey="tiempoEnfoque" name="Minutos de Enfoque" stroke="var(--color-tiempoEnfoque)" strokeWidth={2} dot={{ r: 4, fill: 'var(--color-tiempoEnfoque)' }} activeDot={{ r: 6 }}/>
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
