'use client';

import React from 'react';
import { Plus, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NewTaskDialog from './new-task-dialog';
import type { View } from '@/app/page';
import type { Task } from '@/lib/types';

interface AppHeaderProps {
  view: View;
  activeTaskForPomodoro: Task | null;
}

export default function AppHeader({
  view,
  activeTaskForPomodoro,
}: AppHeaderProps) {
  const [showModal, setShowModal] = React.useState(false);

  return (
    <>
      <header className="h-16 bg-card border-b flex items-center justify-between px-4 md:px-8 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-foreground">
            {view === 'board' ? 'Tablero de Negocios' : 'Centro de Comando'}
          </h1>
          {activeTaskForPomodoro && (
            <div className="hidden md:flex items-center gap-2 bg-accent/10 text-accent-foreground/80 px-3 py-1 rounded-full text-xs font-bold border border-accent/20 animate-pulse">
              <Timer size={12} />
              Enfocado en: {activeTaskForPomodoro.title}
            </div>
          )}
        </div>

        <Button
          onClick={() => setShowModal(true)}
          className="shadow-sm transition-transform active:scale-95"
        >
          <Plus size={18} />
          <span className="hidden sm:inline">Nuevo Negocio/Tarea</span>
        </Button>
      </header>
      <NewTaskDialog open={showModal} onOpenChange={setShowModal} />
    </>
  );
}
