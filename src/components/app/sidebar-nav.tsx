'use client';

import React from 'react';
import { Layout, Calendar, Users } from 'lucide-react';
import type { View } from '@/app/page';
import { cn } from '@/lib/utils';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';

interface SidebarNavProps {
  view: View;
  setView: (view: View) => void;
}

export default function SidebarNav({ view, setView }: SidebarNavProps) {
  const navItems = [
    { id: 'board', label: 'Tablero Visual', icon: Layout },
    { id: 'planning', label: 'Planeación Diaria', icon: Calendar },
    { id: 'team', label: 'Equipo', icon: Users },
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
            <span className="hidden lg:inline">{item.label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
