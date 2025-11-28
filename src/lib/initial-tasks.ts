import type { Task } from '@/lib/types';

// This data is now for placeholder/initial seeding, but data will come from Firestore
export const initialTasks: Omit<Task, 'id'>[] = [
  { title: 'Diseñar el nuevo logo', client: 'Proyecto Phoenix', progress: 80, dueDate: '2024-11-30', status: 'negotiation', priority: 'high', delegateTo: 'Carlos', description: 'Crear 3 propuestas de logo basadas en el brief.', value: 5000, probability: 75 },
  { title: 'Investigación de mercado', client: 'Lanzamiento App', progress: 20, dueDate: '2024-12-05', status: 'prospecting', priority: 'medium', delegateTo: '', description: 'Analizar competidores y definir público objetivo.', value: 10000, probability: 60 },
  { title: 'Revisar contrato con proveedor', client: 'Infraestructura', progress: 95, dueDate: '2024-11-28', status: 'closing', priority: 'high', delegateTo: 'Ana', description: 'Revisión final por parte del equipo legal.', value: 2500, probability: 95 },
  { title: 'Kick-off nuevo proyecto web', client: 'Cliente Web', progress: 0, dueDate: '2024-12-10', status: 'closing', priority: 'medium', delegateTo: 'Laura', description: 'Reunión inicial para definir alcance y objetivos.', value: 20000, probability: 90 },
  { title: 'Llamada de seguimiento con equipo', client: 'Proyecto Phoenix', progress: 60, dueDate: '2024-12-02', status: 'negotiation', priority: 'low', delegateTo: '', description: 'Sincronización semanal de avances.', value: 5000, probability: 75 },
  { title: 'Preparar presentación de resultados Q4', client: 'Interno', progress: 40, dueDate: '2024-12-15', status: 'prospecting', priority: 'medium', delegateTo: 'Carlos', description: 'Recopilar métricas y crear slides.', value: 0, probability: 100 },
];
