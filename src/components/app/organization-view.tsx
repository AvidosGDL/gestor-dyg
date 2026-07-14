
'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, doc, writeBatch, updateDoc } from 'firebase/firestore';
import type { UserProfile, TeamMember } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, Star, StarOff, Users, Edit, ImageUp, ShieldCheck, Landmark, KanbanSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Label } from '../ui/label';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '../ui/switch';

const AVATAR_OPTIONS = 7;
const avatarCollection = 'lorelei';
const generateAvatarUrl = (seed: string) => `https://api.dicebear.com/8.x/${avatarCollection}/svg?seed=${seed}`;

const adminEditUserSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('Correo no válido'),
  role: z.string().min(1, 'El rol es requerido'),
  phone: z.string().optional(),
  avatarUrl: z.string().url('Por favor, selecciona un avatar'),
});

type AdminEditUserValues = z.infer<typeof adminEditUserSchema>;

export default function OrganizationView() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [selectedUserForTeams, setSelectedUserForTeams] = useState<UserProfile | null>(null);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<UserProfile | null>(null);

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
    try {
        const batch = writeBatch(firestore);
        const userRef = doc(firestore, 'users', targetUser.uid);
        batch.update(userRef, { ownerIds: ownerIds, ownerId: ownerIds[0] || null });
        const oldOwnerIds = targetUser.ownerIds || (targetUser.ownerId ? [targetUser.ownerId] : []);
        const removedBosses = oldOwnerIds.filter(id => !ownerIds.includes(id));
        const addedBosses = ownerIds.filter(id => !oldOwnerIds.includes(id));
        for (const bossId of removedBosses) {
            batch.delete(doc(firestore, `users/${bossId}/teamMembers`, targetUser.uid));
        }
        for (const bossId of addedBosses) {
            const memberRef = doc(firestore, `users/${bossId}/teamMembers`, targetUser.uid);
            batch.set(memberRef, {
                id: targetUser.uid,
                uid: targetUser.uid,
                name: targetUser.name,
                email: targetUser.email,
                role: targetUser.role || 'Miembro',
                avatarUrl: targetUser.avatarUrl,
                phone: targetUser.phone,
                authType: 'email'
            });
        }
        await batch.commit();
        toast({ title: '¡Éxito!', description: `La jerarquía de ${targetUser.name} ha sido actualizada.` });
        setSelectedUserForTeams(null);
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
        setIsAssigning(false);
    }
  };

  const togglePermission = async (targetUid: string, field: 'canAccessBanks' | 'canAccessInvestors' | 'canAccessProjects', currentVal: boolean) => {
    if (!firestore) return;
    const userRef = doc(firestore, 'users', targetUid);
    try {
        await updateDoc(userRef, { [field]: !currentVal });
        toast({ title: 'Permiso actualizado', description: 'El cambio se aplicará en el próximo inicio de sesión o recarga.' });
    } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el permiso.' });
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="h-full flex flex-col space-y-4">
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle>Configuración Global de Estructura y Accesos</CardTitle>
          <CardDescription>Administra jerarquías, perfiles y permisos especiales de los módulos.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col overflow-hidden pt-2">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por nombre o correo..." 
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Tabs defaultValue="structure" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="structure"><Users className="mr-2 h-4 w-4" /> Estructura y Perfiles</TabsTrigger>
              <TabsTrigger value="permissions"><ShieldCheck className="mr-2 h-4 w-4" /> Accesos Especiales</TabsTrigger>
            </TabsList>

            <TabsContent value="structure" className="flex-1 overflow-auto border rounded-md mt-4">
                <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                    <TableHead className="w-[300px]">Usuario</TableHead>
                    <TableHead>Rol Actual</TableHead>
                    <TableHead className="text-center">Es Líder</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredUsers.map(u => (
                    <TableRow key={u.id}>
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
                        <TableCell className="text-center">
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={async () => {
                                    const ref = doc(firestore!, 'users', u.id);
                                    await updateDoc(ref, { isTeamLeader: !u.isTeamLeader });
                                }}
                                className={cn("h-8 w-8", u.isTeamLeader ? "text-amber-500" : "text-muted-foreground/30")}
                            >
                                {u.isTeamLeader ? <Star className="h-5 w-5 fill-amber-500" /> : <StarOff className="h-5 w-5" />}
                            </Button>
                        </TableCell>
                        <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedUserForEdit(u)} className="h-8 gap-2">
                                <Edit size={14}/> Perfil
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedUserForTeams(u)} className="h-8 gap-2">
                                <Users size={14}/> Equipo
                            </Button>
                        </div>
                        </TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            </TabsContent>

            <TabsContent value="permissions" className="flex-1 overflow-auto border rounded-md mt-4">
                <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                    <TableHead className="w-[300px]">Usuario</TableHead>
                    <TableHead className="text-center"><div className="flex items-center justify-center gap-2"><Landmark size={14} /> Bancos</div></TableHead>
                    <TableHead className="text-center"><div className="flex items-center justify-center gap-2"><Landmark size={14} /> Inversionistas</div></TableHead>
                    <TableHead className="text-center"><div className="flex items-center justify-center gap-2"><KanbanSquare size={14} /> Proyectos</div></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredUsers.map(u => (
                    <TableRow key={`perm-${u.id}`}>
                        <TableCell>
                            <p className="font-medium text-sm">{u.name}</p>
                            <p className="text-[10px] text-muted-foreground">{u.email}</p>
                        </TableCell>
                        <TableCell className="text-center">
                            <Switch 
                                checked={!!u.canAccessBanks} 
                                onCheckedChange={() => togglePermission(u.id, 'canAccessBanks', !!u.canAccessBanks)} 
                            />
                        </TableCell>
                        <TableCell className="text-center">
                            <Switch 
                                checked={!!u.canAccessInvestors} 
                                onCheckedChange={() => togglePermission(u.id, 'canAccessInvestors', !!u.canAccessInvestors)} 
                            />
                        </TableCell>
                        <TableCell className="text-center">
                            <Switch 
                                checked={!!u.canAccessProjects} 
                                onCheckedChange={() => togglePermission(u.id, 'canAccessProjects', !!u.canAccessProjects)} 
                            />
                        </TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {selectedUserForTeams && (
        <AssignBossDialog 
          user={selectedUserForTeams}
          allUsers={allUsers || []}
          onClose={() => setSelectedUserForTeams(null)}
          onSave={handleUpdateTeams}
          isProcessing={isAssigning}
        />
      )}

      {selectedUserForEdit && (
        <AdminEditUserDialog
            user={selectedUserForEdit}
            onClose={() => setSelectedUserForEdit(null)}
            onSave={async (uid, data) => {
                await updateDoc(doc(firestore!, 'users', uid), data);
                setSelectedUserForEdit(null);
                toast({ title: 'Perfil guardado' });
            }}
        />
      )}
    </div>
  );
}

function AdminEditUserDialog({ user, onClose, onSave }: any) {
    const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<AdminEditUserValues>({
        resolver: zodResolver(adminEditUserSchema),
        defaultValues: {
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone || '',
            avatarUrl: user.avatarUrl,
        }
    });

    const onSubmit: SubmitHandler<AdminEditUserValues> = async (data) => {
        await onSave(user.uid || (user as any).id, data);
    };

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader><DialogTitle>Editar Perfil Administrativo</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
                    <div className="space-y-2"><Label>Nombre</Label><Input {...register('name')} /></div>
                    <div className="space-y-2"><Label>Correo</Label><Input {...register('email')} /></div>
                    <div className="space-y-2"><Label>Rol</Label><Input {...register('role')} /></div>
                    <div className="space-y-2"><Label>Teléfono</Label><Input {...register('phone')} /></div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" disabled={isSubmitting}>Guardar Cambios</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function AssignBossDialog({ user, allUsers, onClose, onSave, isProcessing }: any) {
  const [currentBossIds, setCurrentBossIds] = useState<string[]>(user.ownerIds || (user.ownerId ? [user.ownerId] : []));
  const leaders = useMemo(() => allUsers.filter((u: any) => (u.uid || u.id) !== user.uid && u.isTeamLeader), [allUsers, user.uid]);

  const toggleBoss = (bossId: string) => {
    if (currentBossIds.includes(bossId)) setCurrentBossIds(prev => prev.filter(id => id !== bossId));
    else if (currentBossIds.length < 2) setCurrentBossIds(prev => [...prev, bossId]);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Asignar Jefes para {user.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-2 my-4 max-h-60 overflow-y-auto">
            {leaders.map((boss: any) => (
                <div key={boss.id} onClick={() => toggleBoss(boss.id)} className={cn("p-3 border rounded-md cursor-pointer flex items-center justify-between", currentBossIds.includes(boss.id) ? "border-primary bg-primary/5" : "hover:bg-muted")}>
                    <span>{boss.name}</span>
                    {currentBossIds.includes(boss.id) && <Star className="h-4 w-4 fill-primary text-primary" />}
                </div>
            ))}
        </div>
        <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => onSave(user, currentBossIds)} disabled={isProcessing}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
