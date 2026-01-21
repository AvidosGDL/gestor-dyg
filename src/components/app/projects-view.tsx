
'use client';

import React, { useState } from 'react';
import { useProjects } from '@/contexts/projects-context';
import type { Project } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KanbanSquare, Loader2, Upload } from 'lucide-react';
import ProjectDetailView from './project-detail-view';
import ImportProjectDialog from './import-project-dialog';

function ProjectCard({ project, onSelect }: { project: Project, onSelect: (id: string) => void }) {
  return (
    <Card className="flex flex-col hover:shadow-md hover:border-primary/50 transition-all cursor-pointer" onClick={() => onSelect(project.id)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <KanbanSquare className="text-primary" />
            {project.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-end">
        <Button variant="outline" className="w-full mt-4">
          Ver Detalles
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ProjectsView() {
  const { projects, loading } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const selectedProject = React.useMemo(() => {
    if (!selectedProjectId) return null;
    return projects.find(p => p.id === selectedProjectId);
  }, [selectedProjectId, projects]);

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
              <ProjectCard key={project.id} project={project} onSelect={setSelectedProjectId} />
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
    </>
  );
}

    