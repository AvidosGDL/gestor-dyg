'use client';

import React from 'react';
import { Layout, Calendar, Users, FileUp, Handshake, LineChart, Archive, Landmark } from 'lucide-react';
import type { View } from '@/app/page';
import { cn } from '@/lib/utils';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
} from '@/components/ui/sidebar';
import { useUser } from '@/firebase';

interface SidebarNavProps {
  view: View;
  setView: (view: View) => void;
}

export default function SidebarNav({ view, setView }: SidebarNavProps) {
  const { user } = useUser();
  const isAuthorizedForInvestors = user?.uid === 'fKZUAAXTENPcUeEA4tUXFEV4xbr1' || user?.uid === 'cbXyvN4G98Q7Y9IaJHhec0MyjlT2';

  const navItems = [
    { id: 'board', label: 'Tablero Visual', icon: Layout },
    { id: 'planning', label: 'Planeación Diaria', icon: Calendar },
    { id: 'prospects', label: 'Prospectos', icon: Handshake },
    { id: 'analytics', label: 'Análisis', icon: LineChart },
    { id: 'team', label: 'Equipo', icon: Users },
    { id: 'import', label: 'Importar Tareas', icon: FileUp },
    { id: 'history', label: 'Histórico de Tareas', icon: Archive },
    ...(isAuthorizedForInvestors ? [{ id: 'investors', label: 'Inversionistas', icon: Landmark }] : []),
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
             {(item as any).notification && (
              <SidebarMenuBadge className="bg-accent" />
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
