

'use client';

import React, { useState, useMemo } from 'react';
import type { Project, ProjectActivity } from '@/lib/types';
import { useProjects } from '@/contexts/projects-context';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, Loader2, Edit, Trash2, GanttChartSquare, GitBranchPlus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import EditActivityDialog from './edit-activity-dialog';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { addDays, format, differenceInDays, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';


// Gantt Chart Component
const GanttChart = ({ activities }: { activities: ProjectActivity[] }) => {
  const chartData = useMemo(() => {
    if (activities.length === 0) return [];
    
    const sortedActivities = [...activities].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    const projectStartDate = parseISO(sortedActivities[0].startDate);
    
    // Calculate critical path
    const activitiesMap = new Map(activities.map(a => [a.id, a]));
    const adj: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};
    activities.forEach(a => {
        adj[a.id] = [];
        inDegree[a.id] = 0;
    });
    activities.forEach(a => {
        if(a.dependencyId && activitiesMap.has(a.dependencyId)) {
            adj[a.dependencyId].push(a.id);
            inDegree[a.id]++;
        }
    });

    const q = Object.keys(inDegree).filter(id => inDegree[id] === 0);
    const earlyStart: Record<string, number> = {};
    activities.forEach(a => earlyStart[a.id] = 0);
    
    while(q.length > 0) {
        const u = q.shift()!;
        const uActivity = activitiesMap.get(u)!;
        const uEndDate = earlyStart[u] + uActivity.durationDays;
        
        adj[u].forEach(v => {
            earlyStart[v] = Math.max(earlyStart[v], uEndDate);
            inDegree[v]--;
            if(inDegree[v] === 0) {
                q.push(v);
            }
        });
    }
    
    const projectEndDate = Math.max(...Object.values(earlyStart).map((start, i) => start + activities[i].durationDays));

    const lateFinish: Record<string, number> = {};
    activities.forEach(a => lateFinish[a.id] = projectEndDate);
    
    // This is a simplified critical path logic
    const criticalPathIds = new Set<string>();
    let lastTask = activities.reduce((prev, curr) => (earlyStart[prev.id] + prev.durationDays > earlyStart[curr.id] + curr.durationDays) ? prev : curr);
    criticalPathIds.add(lastTask.id);


    return sortedActivities.map(activity => {
      const startDay = differenceInDays(parseISO(activity.startDate), projectStartDate);
      return {
        name: activity.name,
        range: [startDay, startDay + activity.durationDays],
        isCritical: criticalPathIds.has(activity.id),
      };
    });
  }, [activities]);

  if (activities.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={activities.length * 50 + 50}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 100, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" unit=" días" />
        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(value: any, name: any, props) => {
            const range = props.payload.range;
            return `Día ${range[0]} - Día ${range[1]} (Duración: ${range[1] - range[0]} días)`;
          }}
          labelFormatter={(label) => label}
        />
        <Bar dataKey="range" stackId="a" fill="hsl(var(--primary) / 0.7)" radius={[4, 4, 4, 4]}>
          {chartData.map((entry, index) => (
            <div key={`cell-${index}`} style={{ fill: entry.isCritical ? 'hsl(var(--destructive))' : 'hsl(var(--primary))' }} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export default function ProjectDetailView({ project, onBack }: { project: Project; onBack: () => void }) {
  const { getActivitiesForProject, deleteProject } = useProjects();
  const { activities, loading } = getActivitiesForProject(project.id);
  const [editingActivity, setEditingActivity] = useState<ProjectActivity | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [subtaskParentId, setSubtaskParentId] = useState<string | null>(null);

  const handleEdit = (activity: ProjectActivity) => {
    setEditingActivity(activity);
    setSubtaskParentId(activity.parentId);
    setIsDialogOpen(true);
  };
  
  const handleAddNew = () => {
    setEditingActivity(null);
    setSubtaskParentId(null);
    setIsDialogOpen(true);
  };
  
  const handleAddSubtask = (parentId: string) => {
    setEditingActivity(null);
    setSubtaskParentId(parentId);
    setIsDialogOpen(true);
  };

  const projectCosts = useMemo(() => {
    const totalBudgeted = activities.reduce((sum, act) => sum + act.budgetedCost, 0);
    const totalActual = activities.reduce((sum, act) => sum + act.actualCost, 0);
    return { totalBudgeted, totalActual, deviation: totalActual - totalBudgeted };
  }, [activities]);
  
  const hierarchicalActivities = useMemo(() => {
    const activityMap = new Map(activities.map(a => [a.id, { ...a, children: [] as ProjectActivity[] }]));
    const rootActivities: (ProjectActivity & { children: ProjectActivity[] })[] = [];

    activities.forEach(act => {
      if (act.parentId && activityMap.has(act.parentId)) {
        activityMap.get(act.parentId)!.children.push(act as any);
      } else {
        rootActivities.push(activityMap.get(act.id)!);
      }
    });

    const flattened: (ProjectActivity & { level: number })[] = [];
    function flatten(activity: ProjectActivity & { children: ProjectActivity[] }, level: number) {
      flattened.push({ ...activity, level });
      activity.children.forEach(child => flatten(activityMap.get(child.id)!, level + 1));
    }
    
    rootActivities.forEach(root => flatten(root, 0));
    
    return flattened;
  }, [activities]);

  return (
    <>
      <div className="h-full flex flex-col p-2 space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={onBack} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-bold">{project.name}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
                <CardHeader><CardTitle>Costo Presupuestado</CardTitle></CardHeader>
                <CardContent><p className="text-3xl font-bold">${projectCosts.totalBudgeted.toLocaleString()}</p></CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle>Costo Real</CardTitle></CardHeader>
                <CardContent><p className="text-3xl font-bold">${projectCosts.totalActual.toLocaleString()}</p></CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle>Desviación</CardTitle></CardHeader>
                <CardContent>
                    <p className={`text-3xl font-bold ${projectCosts.deviation > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                        ${projectCosts.deviation.toLocaleString()}
                    </p>
                </CardContent>
            </Card>
        </div>

        <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><GanttChartSquare /> Diagrama de Gantt</CardTitle><CardDescription>Visualización del cronograma del proyecto.</CardDescription></CardHeader>
            <CardContent>
                {loading ? <Loader2 className="animate-spin" /> : <GanttChart activities={activities} />}
            </CardContent>
        </Card>

        <Card className="flex-1 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Actividades del Proyecto</CardTitle>
              <CardDescription>Lista de todas las tareas planificadas.</CardDescription>
            </div>
            <Button onClick={handleAddNew}><Plus className="mr-2 h-4 w-4" /> Nueva Actividad</Button>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden">
             <div className="border rounded-lg h-full overflow-y-auto">
                <Table>
                    <TableHeader className="sticky top-0 bg-muted z-10">
                        <TableRow>
                            <TableHead>Actividad</TableHead>
                            <TableHead>Inicio</TableHead>
                            <TableHead>Fin</TableHead>
                            <TableHead>Progreso</TableHead>
                            <TableHead>Costo Real</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading && <TableRow><TableCell colSpan={6} className="text-center p-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>}
                        {!loading && hierarchicalActivities.map(act => {
                            const endDate = format(addDays(parseISO(act.startDate), act.durationDays), 'dd/MM/yyyy');
                            return (
                                <TableRow key={act.id}>
                                    <TableCell className={cn("font-medium", act.level > 0 && "pl-8")}>
                                      <div className="flex items-center gap-2">
                                        {act.level > 0 && <span className="text-muted-foreground">└─</span>}
                                        {act.name}
                                      </div>
                                    </TableCell>
                                    <TableCell>{format(parseISO(act.startDate), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell>{endDate}</TableCell>
                                    <TableCell><Badge variant={act.progress === 100 ? "default" : "secondary"}>{act.progress}%</Badge></TableCell>
                                    <TableCell>${act.actualCost.toLocaleString()}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleAddSubtask(act.id)} title="Agregar Subtarea">
                                            <GitBranchPlus className="h-4 w-4 text-muted-foreground" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(act)} title="Editar Actividad">
                                            <Edit className="h-4 w-4 text-muted-foreground" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                         {!loading && activities.length === 0 && <TableRow><TableCell colSpan={6} className="text-center h-24 text-muted-foreground">No hay actividades en este proyecto.</TableCell></TableRow>}
                    </TableBody>
                </Table>
             </div>
          </CardContent>
        </Card>
      </div>

      <EditActivityDialog 
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        project={project}
        activity={editingActivity}
        projectActivities={activities}
        parentId={subtaskParentId}
      />
    </>
  );
}
