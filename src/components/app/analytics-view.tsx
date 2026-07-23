'use client';

import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, Cell, PieChart, Pie } from 'recharts';
import { useTasks } from '@/contexts/tasks-context';
import { useHistory } from '@/contexts/history-context';
import { useUser } from '@/firebase';
import type { Task } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, isWithinInterval, subDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { TrendingUp, CheckCircle2, Clock, CalendarCheck, Zap, AlertTriangle, FileText, Download } from 'lucide-react';
import { ChartContainer, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Period = 'day' | 'week' | 'month';

interface AnalyticsViewProps {
  taskFilter: string;
}

// Helper to format duration from milliseconds to a readable string like "2h 30m"
const formatDuration = (milliseconds: number) => {
  if (milliseconds <= 0) return '0m';
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
  const [isExporting, setIsExporting] = useState(false);
  
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
      return allTasks.filter(t => t.ownerId === user.uid || t.delegateToId === user.uid);
    }
    
    return allTasks.filter(t => (t.ownerId === taskFilter && !t.delegateToId) || (t.delegateToId === taskFilter));
  }, [allTasks, user, taskFilter, loading]);
  
  const completedTasks = useMemo(() => {
     return filteredTasksForView.filter(t => t.status === 'completado').sort((a,b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
     });
  }, [filteredTasksForView]);


  const chartData = useMemo(() => {
    const now = new Date();
    let interval: { start: Date; end: Date };
    let timeUnitFormat: string;
    let getIntervals;
    
    if (period === 'day') {
      interval = { start: subDays(now, 6), end: now };
      timeUnitFormat = 'dd/MM/yyyy';
      getIntervals = eachDayOfInterval;
    } else if (period === 'week') {
      interval = { start: subDays(now, 6 * 7), end: now };
      timeUnitFormat = "'Sem' w";
      getIntervals = (int: any) => eachWeekOfInterval(int, { weekStartsOn: 1 });
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
        if (!t.dueDate) return true;
        if (!t.updatedAt) return false;
        // Check if finished at or before due date
        const completion = new Date(t.updatedAt).getTime();
        const due = new Date(t.dueDate + 'T23:59:59').getTime();
        return completion <= due;
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
  
  const totalTasksCompleted = useMemo(() => completedTasks.length, [completedTasks]);
  const totalTimeFocusedMs = useMemo(() => {
      return completedTasks.reduce((acc, task) => {
          const taskTime = (task.focusSessions || []).reduce((sessionAcc, session) => {
              return sessionAcc + (new Date(session.endTime).getTime() - new Date(session.startTime).getTime());
          }, 0);
          return acc + taskTime;
      }, 0);
  }, [completedTasks]);

  const totalOnTimeTasks = useMemo(() => {
      return completedTasks.filter(t => {
          if (!t.dueDate) return true;
          if (!t.updatedAt) return false;
          const completion = new Date(t.updatedAt).getTime();
          const due = new Date(t.dueDate + 'T23:59:59').getTime();
          return completion <= due;
      }).length;
  }, [completedTasks]);

  const onTimePercentage = totalTasksCompleted > 0 ? Math.round((totalOnTimeTasks / totalTasksCompleted) * 100) : 0;

  const getTaskExecutionTime = (task: Task) => {
    return (task.focusSessions || []).reduce((acc, s) => acc + (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()), 0);
  };

  const exportToPDF = () => {
    setIsExporting(true);
    try {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;

        // Header
        doc.setFontSize(22);
        doc.setTextColor(63, 81, 181); // Primary color
        doc.text('Reporte de Eficiencia y Productividad', pageWidth / 2, 20, { align: 'center' });

        // Congratulatory message
        doc.setFontSize(16);
        doc.setTextColor(34, 197, 94); // Emerald color
        doc.setFont('helvetica', 'bolditalic');
        doc.text('¡Muchas felicidades por el gran avance en tus objetivos!', pageWidth / 2, 32, { align: 'center' });
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.setFontSize(10);
        doc.text(`Generado el: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, 40, { align: 'center' });
        doc.text(`Filtro aplicado: ${taskFilter === 'me' ? 'Mis Tareas' : taskFilter === 'all' ? 'Todo el Equipo' : 'Usuario Específico'}`, pageWidth / 2, 45, { align: 'center' });

        // Summary section
        doc.setDrawColor(200);
        doc.line(14, 52, pageWidth - 14, 52);

        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text('Resumen General de Rendimiento', 14, 62);
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`- Tareas Completadas: ${totalTasksCompleted}`, 20, 72);
        doc.text(`- Puntualidad en Entregas: ${onTimePercentage}% (${totalOnTimeTasks} de ${totalTasksCompleted} a tiempo)`, 20, 78);
        doc.text(`- Tiempo Total de Enfoque: ${formatDuration(totalTimeFocusedMs)}`, 20, 84);
        doc.text(`- Ratio de Eficiencia Promedio: ${totalTasksCompleted > 0 ? formatDuration(totalTimeFocusedMs / totalTasksCompleted) : '0m'} por tarea`, 20, 90);

        // List of tasks
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Auditoría Detallada de Tareas Finalizadas', 14, 105);

        const tableData = completedTasks.map(task => {
            const timeUsed = getTaskExecutionTime(task);
            const isLate = task.dueDate && task.updatedAt && new Date(task.updatedAt).getTime() > new Date(task.dueDate + 'T23:59:59').getTime();
            return [
                task.title,
                task.client || 'Sin Proyecto',
                task.updatedAt ? format(new Date(task.updatedAt), 'dd/MM/yy HH:mm') : 'N/A',
                formatDuration(timeUsed),
                isLate ? 'FUERA DE PLAZO' : 'A TIEMPO'
            ];
        });

        autoTable(doc, {
            startY: 110,
            head: [['Tarea / Descripción', 'Proyecto', 'Finalizada el', 'Tiempo Invertido', 'Cumplimiento']],
            body: tableData.length > 0 ? tableData : [['No hay tareas registradas', '-', '-', '-', '-']],
            theme: 'striped',
            headStyles: { fillColor: [63, 81, 181], fontSize: 9, halign: 'center' },
            bodyStyles: { fontSize: 8 },
            columnStyles: {
                0: { cellWidth: 70 },
                1: { cellWidth: 35 },
                2: { cellWidth: 30, halign: 'center' },
                3: { cellWidth: 30, halign: 'center' },
                4: { cellWidth: 25, halign: 'center' },
            },
        });

        doc.save(`Reporte_Eficiencia_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
    } catch (err) {
        console.error("Error generating PDF:", err);
    } finally {
        setIsExporting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto space-y-6 p-1">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold">Análisis de Eficiencia</h2>
            <p className="text-muted-foreground">Métricas de cumplimiento y tiempo invertido en tareas completadas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
            <Button 
                variant="outline" 
                size="sm" 
                onClick={exportToPDF} 
                disabled={isExporting || completedTasks.length === 0}
                className="gap-2 border-primary text-primary hover:bg-primary/5 h-9"
            >
                {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                Exportar Reporte PDF
            </Button>
            <div className="bg-muted p-1 rounded-lg flex h-9">
              <Button variant={period === 'day' ? 'secondary' : 'ghost'} size="sm" onClick={() => setPeriod('day')}>Día</Button>
              <Button variant={period === 'week' ? 'secondary' : 'ghost'} size="sm" onClick={() => setPeriod('week')}>Semana</Button>
              <Button variant={period === 'month' ? 'secondary' : 'ghost'} size="sm" onClick={() => setPeriod('month')}>Mes</Button>
            </div>
        </div>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-tight text-muted-foreground">Completadas</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-bold">{totalTasksCompleted}</div>
                <p className="text-xs text-muted-foreground mt-1">Total de logros alcanzados</p>
            </CardContent>
        </Card>
        <Card className={cn("border-l-4", onTimePercentage >= 80 ? "border-l-emerald-500" : "border-l-amber-500")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-tight text-muted-foreground">Puntualidad</CardTitle>
                <CalendarCheck className={cn("h-4 w-4", onTimePercentage >= 80 ? "text-emerald-500" : "text-amber-500")} />
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-bold">{onTimePercentage}%</div>
                <p className="text-xs text-muted-foreground mt-1">{totalOnTimeTasks} de {totalTasksCompleted} a tiempo</p>
            </CardContent>
        </Card>
        <Card className="border-l-4 border-l-accent">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-tight text-muted-foreground">Tiempo Invertido</CardTitle>
                <Clock className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-bold">{formatDuration(totalTimeFocusedMs)}</div>
                <p className="text-xs text-muted-foreground mt-1">Tiempo real de enfoque acumulado</p>
            </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-tight text-muted-foreground">Ratio de Eficiencia</CardTitle>
                <Zap className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-bold">
                    {totalTasksCompleted > 0 ? formatDuration(totalTimeFocusedMs / totalTasksCompleted) : '0m'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Esfuerzo promedio por tarea</p>
            </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cumplimiento de Plazos</CardTitle>
            <CardDescription>Comparativo de tareas terminadas vs. entregadas en fecha.</CardDescription>
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
            <CardTitle>Intensidad de Trabajo</CardTitle>
            <CardDescription>Minutos de enfoque dedicados a cerrar proyectos.</CardDescription>
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

      <Card>
          <CardHeader>
              <CardTitle>Auditoría de Eficiencia por Tarea</CardTitle>
              <CardDescription>Detalle de las tareas completadas recientemente y su desempeño individual.</CardDescription>
          </CardHeader>
          <CardContent>
              <ScrollArea className="h-[300px]">
                  <div className="space-y-4 pr-4">
                      {completedTasks.length === 0 ? (
                          <div className="text-center py-10 text-muted-foreground italic">No hay tareas completadas registradas.</div>
                      ) : (
                          completedTasks.map(task => {
                              const timeUsed = getTaskExecutionTime(task);
                              const isLate = task.dueDate && task.updatedAt && new Date(task.updatedAt).getTime() > new Date(task.dueDate + 'T23:59:59').getTime();
                              
                              return (
                                  <div key={task.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-muted/30 rounded-xl border border-border gap-4">
                                      <div className="flex-1 min-w-0">
                                          <h4 className="font-bold text-sm truncate">{task.title}</h4>
                                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                              <Badge variant="outline" className="text-[10px] uppercase font-bold">{task.client || 'Sin Proyecto'}</Badge>
                                              <span>Finalizada: {task.updatedAt ? format(new Date(task.updatedAt), 'dd/MM/yy HH:mm') : 'N/A'}</span>
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-6 flex-shrink-0">
                                          <div className="text-right">
                                              <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Tiempo</p>
                                              <div className="flex items-center justify-end gap-1.5 font-mono font-bold text-sm">
                                                  <Clock size={14} className="text-accent"/>
                                                  {formatDuration(timeUsed)}
                                              </div>
                                          </div>
                                          <div className="text-right min-w-[100px]">
                                              <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Entrega</p>
                                              {isLate ? (
                                                  <Badge variant="destructive" className="bg-rose-50 text-rose-700 border-rose-200 flex gap-1 items-center">
                                                      <AlertTriangle size={10}/> FUERA DE PLAZO
                                                  </Badge>
                                              ) : (
                                                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 flex gap-1 items-center">
                                                      <Zap size={10}/> A TIEMPO
                                                  </Badge>
                                              )}
                                          </div>
                                      </div>
                                  </div>
                              );
                          })
                      )}
                  </div>
              </ScrollArea>
          </CardContent>
      </Card>
    </div>
  );
}
