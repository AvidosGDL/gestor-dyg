'use client';

import React, { useEffect, useState } from 'react';
import { Layout, Calendar, Users, FileUp, Handshake, LineChart, Archive, Landmark, KanbanSquare, Network, CalendarClock } from 'lucide-react';
import type { View } from '@/app/page';
import { cn } from '@/lib/utils';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
} from '@/components/ui/sidebar';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { UserProfile } from '@/lib/types';

interface SidebarNavProps {
  view: View;
  setView: (view: View) => void;
}

export default function SidebarNav({ view, setView }: SidebarNavProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    async function fetchProfile() {
        if (user && firestore) {
            const snap = await getDoc(doc(firestore, 'users', user.uid));
            if (snap.exists()) setProfile(snap.data() as UserProfile);
        }
    }
    fetchProfile();
  }, [user, firestore]);

  const isAdmin = user?.uid === 'fKZUAAXTENPcUeEA4tUXFEV4xbr1';
  const isAuthorizedForInvestors = isAdmin || !!profile?.canAccessInvestors;
  const isAuthorizedForBanks = isAdmin || !!profile?.canAccessBanks;
  const isAuthorizedForProjects = isAdmin || !!profile?.canAccessProjects;

  const navItems = [
    { id: 'board', label: 'Tablero Visual', icon: Layout },
    { id: 'calendar', label: 'Calendario y Plazos', icon: CalendarClock },
    { id: 'planning', label: 'Planeación Diaria', icon: Calendar },
    { id: 'prospects', label: 'Prospectos', icon: Handshake },
    ...(isAuthorizedForProjects ? [{ id: 'projects', label: 'Proyectos', icon: KanbanSquare }] : []),
    { id: 'analytics', label: 'Análisis', icon: LineChart },
    { id: 'team', label: 'Equipo', icon: Users },
    { id: 'import', label: 'Importar Tareas', icon: FileUp },
    { id: 'history', label: 'Histórico de Tareas', icon: Archive },
    ...(isAuthorizedForInvestors ? [{ id: 'investors', label: 'Inversionistas', icon: Landmark }] : []),
    ...(isAuthorizedForBanks ? [{ id: 'banks', label: 'Bancos y Saldos', icon: Landmark }] : []),
    ...(isAdmin ? [{ id: 'organization', label: 'Estructura Global', icon: Network }] : []),
  ];

  return (
    <SidebarMenu>
      {navItems.map((item) => (
        <SidebarMenuItem key={item.id}>
          <SidebarMenuButton
            onClick={() => setView(item.id as View)}
            isActive={view === item.id}
            className={cn(
              'justify-start',
              view === item.id
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                : ''
            )}
            tooltip={item.label}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}