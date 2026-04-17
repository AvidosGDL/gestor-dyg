'use client';

import React, { useState, useMemo } from 'react';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, writeBatch } from 'firebase/firestore';
import type { UserProfile, TeamMember } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, Star } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

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
        const userRef = doc(firestore, 'users', targetUser.uid);
        
        // 1. Update user profile
        batch.update(userRef, { ownerIds: ownerIds, ownerId: ownerIds[0] || null });

        // 2. Identify removed and added bosses
        const oldOwnerIds = targetUser.ownerIds || (targetUser.ownerId ? [targetUser.ownerId] : []);
        const removedBosses = oldOwnerIds.filter(id => !ownerIds.includes(id));
        const addedBosses = ownerIds.filter(id => !oldOwnerIds.includes(id));

        // 3. Remove from old bosses' teamMembers subcollections
        for (const bossId of removedBosses) {
            const memberRef = doc(firestore, `users/${bossId}/teamMembers`, targetUser.uid);
            batch.delete(memberRef);
        }

        // 4. Add to new bosses' teamMembers subcollections
        for (const bossId of addedBosses) {
            const memberRef = doc(firestore, `users/${bossId}/teamMembers`, targetUser.uid);
            const teamMemberData: TeamMember = {
                id: targetUser.uid,
                uid: targetUser.uid,
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

  const getBossNames = (u: UserProfile) => {
    const ids = u.ownerIds || (u.ownerId ? [u.ownerId] : []);
    if (ids.length === 0) return <Badge variant="outline">Líder Independiente</Badge>;
    
    return ids.map(id => {
        const boss = allUsers?.find(b => b.uid === id);
        return <Badge key={`${u.uid}-boss-${id}`} variant="secondary" className="mr-1">{boss?.name || 'Desconocido'}</Badge>;
    });
  }

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="h-full flex flex-col space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Estructura de la Organización</CardTitle>
          <CardDescription>Administra los jefes y equipos de todos los usuarios registrados.</CardDescription>
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
                  <TableHead>Usuario</TableHead>
                  <TableHead>Rol Actual</TableHead>
                  <TableHead>Jefe(s) / Equipo</TableHead>
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
                        <div>
                          <p className="font-medium text-sm">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{u.role}</Badge></TableCell>
                    <TableCell>{getBossNames(u)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedUser(u)}>
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

  const possibleBosses = allUsers.filter((u: any) => u.uid !== user.uid);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Gestionar Equipos de {user.name}</DialogTitle>
          <DialogDescription>Selecciona hasta 2 jefes para este usuario. Si no seleccionas ninguno, será un líder independiente.</DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto pr-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-1">
                {possibleBosses.map((boss: any) => (
                    <div 
                        key={boss.uid || boss.id} 
                        className={cn(
                            "flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors",
                            currentBossIds.includes(boss.uid) ? "border-primary bg-primary/5" : "hover:bg-muted"
                        )}
                        onClick={() => toggleBoss(boss.uid)}
                    >
                         <Avatar className="h-8 w-8">
                            <AvatarImage src={boss.avatarUrl} alt={boss.name} />
                            <AvatarFallback>{boss.name[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{boss.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{boss.email}</p>
                        </div>
                        {currentBossIds.includes(boss.uid) && <Star className="h-4 w-4 text-primary fill-primary" />}
                    </div>
                ))}
            </div>
        </div>

        <DialogFooter className="mt-4 pt-4 border-t">
          <Button variant="ghost" onClick={onClose} disabled={isProcessing}>Cancelar</Button>
          <Button onClick={() => onSave(user, currentBossIds)} disabled={isProcessing}>
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}