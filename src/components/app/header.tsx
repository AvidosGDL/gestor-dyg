'use client';

import React from 'react';
import Image from 'next/image';
import { Plus, UserPlus, Timer, Handshake, Filter, User, Users, Landmark, KanbanSquare, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NewTaskDialog from './new-task-dialog';
import NewMemberDialog from './new-member-dialog';
import NewProspectDialog from './new-prospect-dialog';
import NewInvestorDialog from './new-investor-dialog';
import NewBankDialog from './new-bank-dialog';
import type { View } from '@/app/page';
import type { Task, TeamMember } from '@/lib/types';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { UserNav } from '@/components/app/user-nav';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { collection } from 'firebase/firestore';
import NewProjectDialog from './new-project-dialog';

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
  const [showNewInvestorModal, setShowNewInvestorModal] = React.useState(false);
  const [showNewBankDialog, setShowNewBankDialog] = React.useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = React.useState(false);
  const { user } = useUser();
  const firestore = useFirestore();

  const collectionPath = user ? `users/${user.uid}/teamMembers` : null;
  const membersCollectionRef = useMemoFirebase(() => {
    return collectionPath ? collection(firestore, collectionPath) : null;
  }, [collectionPath, firestore]);
  const { data: members } = useCollection<TeamMember>(membersCollectionRef);

  const showAddButton = view === 'board' || view === 'planning';
  const showFilterButton = view === 'board' || view === 'planning' || view === 'analytics' || view === 'history' || view === 'calendar';

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
     if (view === 'investors') {
      return (
        <Button
          onClick={() => setShowNewInvestorModal(true)}
          className="shadow-sm transition-transform active:scale-95"
        >
          <Landmark size={18} />
          <span className="hidden sm:inline">Nuevo Inversionista</span>
        </Button>
      );
    }
    if (view === 'banks') {
      return (
        <Button
          onClick={() => setShowNewBankDialog(true)}
          className="shadow-sm transition-transform active:scale-95"
        >
          <Landmark size={18} />
          <span className="hidden sm:inline">Nueva Cuenta</span>
        </Button>
    }
    if (view === 'projects') {
      return (
        <Button
          onClick={() => setShowNewProjectDialog(true)}
          className="shadow-sm transition-transform active:scale-95"
        >
          <KanbanSquare size={18} />
          <span className="hidden sm:inline">Nuevo Proyecto</span>
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
    if (taskFilter === 'all') return 'Todas';
    const member = members?.find(m => m.uid === taskFilter);
    return member?.name.split(' ')[0] || 'Filtrar';
  };

  return (
    <>
      <header className="h-16 bg-card border-b flex items-center justify-between px-4 md:px-8 flex-shrink-0 sticky top-0 z-40">
        <div className="flex items-center gap-2 md:gap-4">
          <SidebarTrigger className="lg:hidden hidden" />
          <Image
            src="https://firebasestorage.googleapis.com/v0/b/studio-8033020115-912ac.firebasestorage.app/o/public%2Flogo%20DyG.jpeg?alt=media&token=578d1bd8-b8a4-47b6-a97f-e7731dc39bf1"
            alt="Gestor D&G Logo"
            width={28}
            height={28}
            className="w-7 h-7 rounded-md md:w-8 md:h-8 md:rounded-lg"
          />
          <h1 className="text-sm md:text-xl font-bold text-foreground truncate max-w-[120px] md:max-w-none">
            {viewTitles[view]}
          </h1>
          {activeTaskForPomodoro && view !== 'team' && (
            <div className="hidden lg:flex items-center gap-2 bg-accent/10 text-accent-foreground/80 px-3 py-1 rounded-full text-xs font-bold border border-accent/20 animate-pulse">
              <Timer size={12} />
              Enfocado en: {activeTaskForPomodoro.title}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          {showFilterButton && (
             <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="shadow-sm h-8 md:h-10 px-2 md:px-4">
                  <Filter size={14} className="md:mr-2" />
                  <span className="text-xs md:text-sm font-medium">{getFilterLabel()}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={taskFilter} onValueChange={setTaskFilter}>
                  <DropdownMenuRadioItem value="me">
                    <User className="mr-2 h-4 w-4" /> Mis Tareas
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="all">
                    <Users className="mr-2 h-4 w-4" /> Todas las Tareas
                  </DropdownMenuRadioItem>
                  {members && members.length > 0 && <DropdownMenuSeparator />}
                  {members?.map(member => (
                    <DropdownMenuRadioItem key={member.id} value={member.uid}>
                      <User className="mr-2 h-4 w-4" /> {member.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <div className="flex items-center scale-90 md:scale-100">
             {renderAddButton()}
          </div>
          <UserNav />
        </div>
      </header>
      <NewTaskDialog open={showNewTaskModal} onOpenChange={setShowNewTaskModal} />
      {user && <NewMemberDialog
        open={showNewMemberModal}
        onOpenChange={setShowNewMemberModal}
      />}
      <NewProspectDialog open={showNewProspectModal} onOpenChange={setShowNewProspectModal} />
      <NewInvestorDialog open={showNewInvestorModal} onOpenChange={setShowNewInvestorModal} />
      <NewBankDialog open={showNewBankDialog} onOpenChange={setShowNewBankDialog} />
      <NewProjectDialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog} />
    </>
  );
}

const viewTitles: Record<View, string> = {
  board: 'Tablero',
  planning: 'Planeación',
  team: 'Equipo',
  import: 'Importar',
  prospects: 'Prospectos',
  analytics: 'Análisis',
  history: 'Histórico',
  investors: 'Inversionistas',
  banks: 'Bancos',
  projects: 'Proyectos',
  calendar: 'Calendario',
  organization: 'Estructura',
};
