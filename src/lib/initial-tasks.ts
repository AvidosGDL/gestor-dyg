import type { Task } from '@/lib/types';

export const initialTasks: Task[] = [
  { id: 1, title: 'Diseñar el nuevo logo', client: 'Proyecto Phoenix', progress: 80, dueDate: '2024-11-30', status: 'negotiation', priority: 'high', delegateTo: 'Carlos', description: 'Crear 3 propuestas de logo basadas en el brief.', value: 5000, probability: 75 },
  { id: 2, title: 'Investigación de mercado', client: 'Lanzamiento App', progress: 20, dueDate: '2024-12-05', status: 'prospecting', priority: 'medium', delegateTo: '', description: 'Analizar competidores y definir público objetivo.', value: 10000, probability: 60 },
  { id: 3, title: 'Revisar contrato con proveedor', client: 'Infraestructura', progress: 95, dueDate: '2024-11-28', status: 'closing', priority: 'high', delegateTo: 'Ana', description: 'Revisión final por parte del equipo legal.', value: 2500, probability: 95 },
  { id: 4, title: 'Kick-off nuevo proyecto web', client: 'Cliente Web', progress: 0, dueDate: '2024-12-10', status: 'closing', priority: 'medium', delegateTo: 'Laura', description: 'Reunión inicial para definir alcance y objetivos.', value: 20000, probability: 90 },
  { id: 5, title: 'Llamada de seguimiento con equipo', client: 'Proyecto Phoenix', progress: 60, dueDate: '2024-12-02', status: 'negotiation', priority: 'low', delegateTo: '', description: 'Sincronización semanal de avances.', value: 5000, probability: 75 },
  { id: 6, title: 'Preparar presentación de resultados Q4', client: 'Interno', progress: 40, dueDate: '2024-12-15', status: 'prospecting', priority: 'medium', delegateTo: 'Carlos', description: 'Recopilar métricas y crear slides.', value: 0, probability: 100 },
  { id: 7, title: 'Planificación Sprint 5', client: 'Lanzamiento App', progress: 0, dueDate: '2024-12-20', status: 'backlog', priority: 'low', delegateTo: 'Ana', description: 'Definir tareas y prioridades para el próximo sprint.', value: 10000, probability: 50 },
  { id: 8, title: 'Publicar actualización de la app', client: 'Lanzamiento App', progress: 100, dueDate: '2024-11-29', status: 'done', priority: 'high', delegateTo: 'Equipo Dev', description: 'Desplegar la versión 1.2 a producción.', value: 0, probability: 100 },
];
