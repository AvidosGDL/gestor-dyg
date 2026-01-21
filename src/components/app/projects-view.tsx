
'use client';

import React, { useState } from 'react';
import { useProjects } from '@/contexts/projects-context';
import type { Project } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KanbanSquare, Loader2, Upload, MoreVertical, Edit, Trash2 } from 'lucide-react';
import ProjectDetailView from './project-detail-view';
import ImportProjectDialog from './import-project-dialog';
import EditProjectDialog from './edit-project-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';

function ProjectCard({ project, onSelect, onEdit, onDelete }: { project: Project, onSelect: (id: string) => void, onEdit: (project: Project) => void, onDelete: (id: string) => void }) {
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex-1 space-y-1.5 cursor-pointer" onClick={() => onSelect(project.id)}>
            <CardTitle className="flex items-center gap-2">
                <KanbanSquare className="text-primary" />
                {project.name}
            </CardTitle>
        </div>
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                    <MoreVertical className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(project)}>
                    <Edit className="mr-2 h-4 w-4" />
                    <span>Editar Nombre</span>
                </DropdownMenuItem>
                <AlertDialog onOpenChange={() => setDeleteConfirmation('')}>
                    <AlertDialogTrigger asChild>
                        <DropdownMenuItem onSelect={(e) => {e.preventDefault()}} className="text-destructive focus:text-destructive">
                             <Trash2 className="mr-2 h-4 w-4" />
                             <span>Eliminar</span>
                        </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción no se puede deshacer. Esto eliminará permanentemente el proyecto y todas sus actividades. Para confirmar, escribe <strong className="text-foreground">ELIMINAR</strong>.
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                         <Input
                            id="delete-confirm"
                            placeholder='Escribe "ELIMINAR"'
                            value={deleteConfirmation}
                            onChange={(e) => setDeleteConfirmation(e.target.value)}
                            autoComplete="off"
                        />
                        <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => onDelete(project.id)}
                            disabled={deleteConfirmation !== 'ELIMINAR'}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            Confirmar Eliminación
                        </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-end pt-0">
        <Button variant="outline" className="w-full" onClick={() => onSelect(project.id)}>
          Ver Detalles
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ProjectsView() {
  const { projects, loading, deleteProject } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const selectedProject = React.useMemo(() => {
    if (!selectedProjectId) return null;
    return projects.find(p => p.id === selectedProjectId);
  }, [selectedProjectId, projects]);

  const handleEdit = (project: Project) => {
    setEditingProject(project);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (selectedProject) {
    return <ProjectDetailView project={selectedProject} onBack={() => setSelectedProjectId(null)} />;
  }

  return (
    <>
      <div className="h-full flex flex-col space-y-4 p-2">
        <div className="flex justify-end">
            <Button variant="outline" onClick={() => setIsImporting(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Importar desde CSV
            </Button>
        </div>
        
        {projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map(project => (
              <ProjectCard 
                key={project.id} 
                project={project} 
                onSelect={setSelectedProjectId}
                onEdit={handleEdit}
                onDelete={deleteProject}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-center text-muted-foreground border-2 border-dashed rounded-xl">
            <KanbanSquare size={48} className="mb-4" />
            <h3 className="text-lg font-semibold">No hay proyectos registrados</h3>
            <p className="text-sm">Haz clic en "Nuevo Proyecto" para empezar a planificar.</p>
          </div>
        )}
      </div>
      <ImportProjectDialog isOpen={isImporting} onOpenChange={setIsImporting} />
      {editingProject && (
          <EditProjectDialog
            open={!!editingProject}
            onOpenChange={(isOpen) => !isOpen && setEditingProject(null)}
            project={editingProject}
          />
      )}
    </>
  );
}
