import type { Task } from '@/lib/types';

export const initialTasks: Task[] = [
  { id: 1, title: 'Cerrar contrato Licencias', client: 'TechCorp', value: 50000, probability: 80, dueDate: '2024-11-30', status: 'negotiation', priority: 'high', delegateTo: 'Carlos', description: 'Enviar propuesta final con descuento del 5%.' },
  { id: 2, title: 'Presentación Inicial', client: 'Grupo Alfa', value: 120000, probability: 20, dueDate: '2024-12-05', status: 'prospecting', priority: 'medium', delegateTo: '', description: 'Preparar slides corporativos.' },
  { id: 3, title: 'Renovación Anual', client: 'Beta Inc', value: 35000, probability: 95, dueDate: '2024-11-28', status: 'closing', priority: 'high', delegateTo: 'Ana', description: 'Solo falta la firma del director.' },
  { id: 4, title: 'Kick-off nuevo proyecto', client: 'Innovate Solutions', value: 75000, probability: 100, dueDate: '2024-12-10', status: 'closing', priority: 'medium', delegateTo: 'Laura', description: 'Proyecto ya firmado, iniciar planificación.'},
  { id: 5, title: 'Llamada de seguimiento', client: 'Global Net', value: 10000, probability: 60, dueDate: '2024-12-02', status: 'negotiation', priority: 'low', delegateTo: '', description: 'Confirmar si recibieron la cotización.'},
  { id: 6, title: 'Demo de producto', client: 'Startup X', value: 25000, probability: 40, dueDate: '2024-12-15', status: 'prospecting', priority: 'medium', delegateTo: 'Carlos', description: 'Mostrar las nuevas funcionalidades AI.'},
  { id: 7, title: 'Reunión de Q4', client: 'TechCorp', value: 0, probability: 100, dueDate: '2024-12-20', status: 'backlog', priority: 'low', delegateTo: 'Ana', description: 'Planificación estratégica para el próximo año.'},
  { id: 8, title: 'Enviar factura', client: 'Beta Inc', value: 35000, probability: 100, dueDate: '2024-11-29', status: 'done', priority: 'high', delegateTo: 'Admin', description: 'Factura de la renovación anual.'},
];
