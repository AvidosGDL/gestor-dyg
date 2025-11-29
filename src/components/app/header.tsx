'use client';

import React from 'react';
import { Plus, UserPlus, Timer, Handshake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NewTaskDialog from './new-task-dialog';
import NewMemberDialog from './new-member-dialog';
import NewProspectDialog from './new-prospect-dialog';
import type { View } from '@/app/page';
import type { Task } from '@/lib/types';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useUser } from '@/firebase';
import { UserNav } from '@/components/app/user-nav';

interface AppHeaderProps {
  view: View;
  activeTaskForPomodoro: Task | null;
}

export default function AppHeader({
  view,
  activeTaskForPomodoro,
}: AppHeaderProps) {
  const [showNewTaskModal, setShowNewTaskModal] = React.useState(false);
  const [showNewMemberModal, setShowNewMemberModal] = React.useState(false);
  const [showNewProspectModal, setShowNewProspectModal] = React.useState(false);
  const { user } = useUser();

  const showAddButton = view === 'board' || view === 'planning';

  const renderAddButton = () => {
    if (view === 'team') {
      return (
        <Button
          onClick={() => setShowNewMemberModal(true)}
          className="shadow-sm transition-transform active:scale-95"
        >
          <UserPlus size={18} />
          <span className="hidden sm:inline">Nuevo Miembro</span>
        </Button>
      );
    }
    if (view === 'prospects') {
      return (
        <Button
          onClick={() => setShowNewProspectModal(true)}
          className="shadow-sm transition-transform active:scale-95"
        >
          <Handshake size={18} />
          <span className="hidden sm:inline">Nuevo Prospecto</span>
        </Button>
      );
    }
    if (showAddButton) {
       return (
        <Button
          onClick={() => setShowNewTaskModal(true)}
          className="shadow-sm transition-transform active:scale-95"
        >
          <Plus size={18} />
          <span className="hidden sm:inline">Nueva Tarea</span>
        </Button>
      )
    }
    return null;
  }

  return (
    <>
      <header className="h-16 bg-card border-b flex items-center justify-between px-4 md:px-8 flex-shrink-0">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="lg:hidden" />
          <h1 className="text-xl font-bold text-foreground">
            {viewTitles[view]}
          </h1>
          {activeTaskForPomodoro && view !== 'team' && (
            <div className="hidden md:flex items-center gap-2 bg-accent/10 text-accent-foreground/80 px-3 py-1 rounded-full text-xs font-bold border border-accent/20 animate-pulse">
              <Timer size={12} />
              Enfocado en: {activeTaskForPomodoro.title}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          {renderAddButton()}
          <UserNav />
        </div>
      </header>
      <NewTaskDialog open={showNewTaskModal} onOpenChange={setShowNewTaskModal} />
      {user && <NewMemberDialog
        open={showNewMemberModal}
        onOpenChange={setShowNewMemberModal}
      />}
      <NewProspectDialog open={showNewProspectModal} onOpenChange={setShowNewProspectModal} />
    </>
  );
}

const viewTitles: Record<View, string> = {
  board: 'Tablero de Tareas',
  planning: 'Centro de Comando',
  team: 'Gestión de Equipo',
  import: 'Importar Tareas',
  prospects: 'Seguimiento de Prospectos',
};
