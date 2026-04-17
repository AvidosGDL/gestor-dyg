
'use client';

import React, { useState, useMemo } from 'react';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, writeBatch, updateDoc } from 'firebase/firestore';
import type { UserProfile, TeamMember } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, Star, StarOff, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

export default function OrganizationView() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // UseCollection for all users (Admin rule allows this)
  const usersQuery = useMemoFirebase(() => query(collection(firestore, 'users'), orderBy('name')), [firestore]);
  const { data: allUsers, loading } = useCollection<UserProfile>(usersQuery);

  const filteredUsers = useMemo(() => {
    if (!allUsers) return [];
    return allUsers.filter(u => 
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allUsers, searchTerm]);

  const handleUpdateTeams = async (targetUser: UserProfile, ownerIds: string[]) => {
    if (!firestore) return;
    setIsAssigning(true);
    toast({ title: 'Actualizando estructura...', description: 'Sincronizando miembros de equipo.' });

    try {
        const batch = writeBatch(firestore);
        const userRef = doc(firestore, 'users', targetUser.uid || (targetUser as any).id);
        
        // 1. Update user profile
        batch.update(userRef, { ownerIds: ownerIds, ownerId: ownerIds[0] || null });

        // 2. Identify removed and added bosses
        const oldOwnerIds = targetUser.ownerIds || (targetUser.ownerId ? [targetUser.ownerId] : []);
        const removedBosses = oldOwnerIds.filter(id => !ownerIds.includes(id));
        const addedBosses = ownerIds.filter(id => !oldOwnerIds.includes(id));

        // 3. Remove from old bosses' teamMembers subcollections
        for (const bossId of removedBosses) {
            const memberRef = doc(firestore, `users/${bossId}/teamMembers`, targetUser.uid || (targetUser as any).id);
            batch.delete(memberRef);
        }

        // 4. Add to new bosses' teamMembers subcollections
        for (const bossId of addedBosses) {
            const memberRef = doc(firestore, `users/${bossId}/teamMembers`, targetUser.uid || (targetUser as any).id);
            const teamMemberData: TeamMember = {
                id: targetUser.uid || (targetUser as any).id,
                uid: targetUser.uid || (targetUser as any).id,
                name: targetUser.name,
                email: targetUser.email,
                role: targetUser.role || 'Miembro',
                avatarUrl: targetUser.avatarUrl,
                phone: targetUser.phone,
                authType: 'email'
            };
            batch.set(memberRef, teamMemberData);
        }

        await batch.commit();
        toast({ title: '¡Éxito!', description: `La jerarquía de ${targetUser.name} ha sido actualizada.` });
        setSelectedUser(null);
    } catch (error: any) {
        console.error("Error updating organization:", error);
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
        setIsAssigning(false);
    }
  };

  const toggleLeaderStatus = async (targetUser: UserProfile) => {
    if (!firestore) return;
    const userRef = doc(firestore, 'users', targetUser.uid || (targetUser as any).id);
    const newStatus = !targetUser.isTeamLeader;
    
    try {
        await updateDoc(userRef, { isTeamLeader: newStatus });
        toast({ 
            title: newStatus ? 'Líder asignado' : 'Líder removido', 
            description: `${targetUser.name} ${newStatus ? 'ahora' : 'ya no'} aparecerá como posible jefe.` 
        });
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el estado de líder.' });
    }
  }

  const getBossNames = (u: UserProfile) => {
    const ids = u.ownerIds || (u.ownerId ? [u.ownerId] : []);
    if (ids.length === 0) return <Badge variant="outline" className="font-normal text-[10px]">Independiente</Badge>;
    
    return ids.map(id => {
        const boss = allUsers?.find(b => (b.uid || (b as any).id) === id);
        return <Badge key={`${(u.uid || (u as any).id)}-boss-${id}`} variant="secondary" className="mr-1 text-[10px] py-0">{boss?.name || 'Desconocido'}</Badge>;
    });
  }

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="h-full flex flex-col space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Estructura de la Organización</CardTitle>
          <CardDescription>Administra quiénes son líderes y ajusta los equipos de trabajo.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por nombre o correo..." 
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Usuario</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Jefe(s) Actuales</TableHead>
                  <TableHead className="text-center">Es Líder</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map(u => (
                  <TableRow key={u.uid || (u as any).id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={u.avatarUrl} alt={u.name} />
                          <AvatarFallback>{u.name[0]}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{u.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{u.role}</Badge></TableCell>
                    <TableCell>{getBossNames(u)}</TableCell>
                    <TableCell className="text-center">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => toggleLeaderStatus(u)}
                                        className={cn("h-8 w-8", u.isTeamLeader ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground/30 hover:text-muted-foreground")}
                                    >
                                        {u.isTeamLeader ? <Star className="h-5 w-5 fill-amber-500" /> : <StarOff className="h-5 w-5" />}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{u.isTeamLeader ? 'Remover como posible jefe' : 'Marcar como posible jefe (Líder)'}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedUser(u)} className="h-8 gap-2">
                        <Users size={14}/>
                        Ajustar Equipo
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {selectedUser && (
        <AssignBossDialog 
          user={selectedUser}
          allUsers={allUsers || []}
          onClose={() => setSelectedUser(null)}
          onSave={handleUpdateTeams}
          isProcessing={isAssigning}
        />
      )}
    </div>
  );
}

function AssignBossDialog({ user, allUsers, onClose, onSave, isProcessing }: any) {
  const [currentBossIds, setCurrentBossIds] = useState<string[]>(user.ownerIds || (user.ownerId ? [user.ownerId] : []));
  const [dialogSearch, setDialogSearch] = useState('');

  const toggleBoss = (bossId: string) => {
    if (currentBossIds.includes(bossId)) {
        setCurrentBossIds(prev => prev.filter(id => id !== bossId));
    } else {
        if (currentBossIds.length >= 2) {
            alert("Un usuario solo puede tener un máximo de 2 jefes.");
            return;
        }
        setCurrentBossIds(prev => [...prev, bossId]);
    }
  };

  // Only users marked as 'isTeamLeader' appear as potential bosses
  const leaders = useMemo(() => {
    return allUsers.filter((u: any) => 
        (u.uid || u.id) !== (user.uid || user.id) && 
        u.isTeamLeader === true &&
        (u.name.toLowerCase().includes(dialogSearch.toLowerCase()) || u.email.toLowerCase().includes(dialogSearch.toLowerCase()))
    );
  }, [allUsers, user.uid, user.id, dialogSearch]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Asignar Jefes para {user.name}</DialogTitle>
          <DialogDescription>Solo los usuarios marcados como "Líderes" en la tabla principal aparecen aquí.</DialogDescription>
        </DialogHeader>
        
        <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
                placeholder="Buscar líder por nombre..." 
                className="pl-9"
                value={dialogSearch}
                onChange={(e) => setDialogSearch(e.target.value)}
            />
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-1">
                {leaders.map((boss: any) => {
                    const bossUid = boss.uid || boss.id;
                    const isSelected = currentBossIds.includes(bossUid);
                    return (
                        <div 
                            key={bossUid} 
                            className={cn(
                                "flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all",
                                isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted border-border"
                            )}
                            onClick={() => toggleBoss(bossUid)}
                        >
                            <Avatar className="h-10 w-10">
                                <AvatarImage src={boss.avatarUrl} alt={boss.name} />
                                <AvatarFallback>{boss.name[0]}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate">{boss.name}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{boss.role}</p>
                            </div>
                            {isSelected && <Star className="h-4 w-4 text-primary fill-primary" />}
                        </div>
                    );
                })}
            </div>
            {leaders.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-xl">
                    <StarOff className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground font-medium">No se encontraron líderes disponibles.</p>
                    <p className="text-xs text-muted-foreground/60">Asegúrate de marcar a alguien como "Líder" en la tabla principal.</p>
                </div>
            )}
        </div>

        <DialogFooter className="mt-4 pt-4 border-t">
          <div className="flex-1 text-xs text-muted-foreground flex items-center">
            {currentBossIds.length} de 2 jefes seleccionados
          </div>
          <Button variant="ghost" onClick={onClose} disabled={isProcessing}>Cancelar</Button>
          <Button onClick={() => onSave(user, currentBossIds)} disabled={isProcessing}>
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar Estructura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
