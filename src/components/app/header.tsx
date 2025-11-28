'use client';

import React from 'react';
import { Plus, Timer, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NewTaskDialog from './new-task-dialog';
import NewMemberDialog from './new-member-dialog';
import type { View } from '@/app/page';
import type { Task } from '@/lib/types';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useUser } from '@/firebase';

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
  const { user } = useUser();

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

        {view === 'team' ? (
          <Button
            onClick={() => setShowNewMemberModal(true)}
            className="shadow-sm transition-transform active:scale-95"
          >
            <UserPlus size={18} />
            <span className="hidden sm:inline">Nuevo Miembro</span>
          </Button>
        ) : (
          <Button
            onClick={() => setShowNewTaskModal(true)}
            className="shadow-sm transition-transform active:scale-95"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Nueva Tarea</span>
          </Button>
        )}
      </header>
      <NewTaskDialog open={showNewTaskModal} onOpenChange={setShowNewTaskModal} />
      {user && <NewMemberDialog
        open={showNewMemberModal}
        onOpenChange={setShowNewMemberModal}
        user={user}
      />}
    </>
  );
}

const viewTitles: Record<View, string> = {
  board: 'Tablero de Tareas',
  planning: 'Centro de Comando',
  team: 'Gestión de Equipo',
};
