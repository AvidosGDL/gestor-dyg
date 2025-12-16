'use client';

import React from 'react';
import { Plus, UserPlus, Timer, Handshake, Filter, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NewTaskDialog from './new-task-dialog';
import NewMemberDialog from './new-member-dialog';
import NewProspectDialog from './new-prospect-dialog';
import type { View } from '@/app/page';
import type { Task, TeamMember } from '@/lib/types';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { UserNav } from '@/components/app/user-nav';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { collection } from 'firebase/firestore';

interface AppHeaderProps {
  view: View;
  activeTaskForPomodoro: Task | null;
  taskFilter: string;
  setTaskFilter: (filter: string) => void;
}

export default function AppHeader({
  view,
  activeTaskForPomodoro,
  taskFilter,
  setTaskFilter,
}: AppHeaderProps) {
  const [showNewTaskModal, setShowNewTaskModal] = React.useState(false);
  const [showNewMemberModal, setShowNewMemberModal] = React.useState(false);
  const [showNewProspectModal, setShowNewProspectModal] = React.useState(false);
  const { user } = useUser();
  const firestore = useFirestore();

  const collectionPath = user ? `users/${user.uid}/teamMembers` : null;
  const membersCollectionRef = useMemoFirebase(() => {
    return collectionPath ? collection(firestore, collectionPath) : null;
  }, [collectionPath, firestore]);
  const { data: members } = useCollection<TeamMember>(membersCollectionRef);

  const showAddButton = view === 'board' || view === 'planning';
  const showFilterButton = view === 'board' || view === 'planning' || view === 'analytics' || view === 'history';

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
  
  const getFilterLabel = () => {
    if (taskFilter === 'me') return 'Mis Tareas';
    if (taskFilter === 'all') return 'Todas las Tareas';
    const member = members?.find(m => m.id === taskFilter);
    return member?.name || 'Filtrar';
  };

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
          {showFilterButton && (
             <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="shadow-sm">
                  <Filter size={16} className="sm:mr-2" />
                  <span className="hidden sm:inline">{getFilterLabel()}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup value={taskFilter} onValueChange={setTaskFilter}>
                  <DropdownMenuRadioItem value="me">
                    <User className="mr-2 h-4 w-4" /> Mis Tareas
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="all">
                    <Users className="mr-2 h-4 w-4" /> Todas las Tareas
                  </DropdownMenuRadioItem>
                  {members && members.length > 0 && <DropdownMenuSeparator />}
                  {members?.map(member => (
                    <DropdownMenuRadioItem key={member.id} value={member.id}>
                      <User className="mr-2 h-4 w-4" /> {member.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
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
  analytics: 'Análisis de Avances',
  history: 'Histórico de Tareas',
};
