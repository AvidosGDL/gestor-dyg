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
import { Search, Loader2, Star, StarOff, Users, Edit, ImageUp, ShieldCheck, Landmark, KanbanSquare, Trash2, UserPlus, Mail, Briefcase, Lock, Key, Send } from 'lucide-react';
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
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

const adminEditUserSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('Correo no válido'),
  role: z.string().min(1, 'El rol es requerido'),
  phone: z.string().optional(),
  avatarUrl: z.string().url('Por favor, selecciona un avatar'),
});

const adminNewUserSchema = z.object({
    name: z.string().min(1, 'El nombre es requerido'),
    email: z.string().email('Correo no válido'),
    role: z.string().min(1, 'El rol es requerido'),
    phone: z.string().optional(),
    bossId: z.string().optional().nullable(),
    password: z.string().optional(),
    useLink: z.boolean().default(true),
});

type AdminEditUserValues = z.infer<typeof adminEditUserSchema>;
type AdminNewUserValues = z.infer<typeof adminNewUserSchema>;

export default function OrganizationView() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedUserForTeams, setSelectedUserForTeams] = useState<UserProfile | null>(null);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<UserProfile | null>(null);
  const [isNewUserDialogOpen, setIsNewUserDialogOpen] = useState(false);

  const usersQuery = useMemoFirebase(() => query(collection(firestore, 'users'), orderBy('name')), [firestore]);
  const { data: allUsers, loading } = useCollection<UserProfile>(usersQuery);

  const filteredUsers = useMemo(() => {
    if (!allUsers) return [];
    return allUsers.filter(u => 
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allUsers, searchTerm]);

  const handleDeleteUser = async (uid: string) => {
    setIsProcessing(true);
    try {
        const functions = getFunctions();
        const deleteFunction = httpsCallable(functions, 'deleteUserAccount');
        await deleteFunction({ uid });
        toast({ title: 'Usuario eliminado', description: 'La cuenta y perfiles asociados han sido borrados.' });
    } catch (error: any) {
        console.error("Delete error:", error);
        toast({ variant: 'destructive', title: 'Error al borrar', description: error.message || 'Error interno del servidor.' });
    } finally {
        setIsProcessing(false);
    }
  };

  const handleUpdateTeams = async (targetUser: UserProfile, ownerIds: string[]) => {
    if (!firestore || !targetUser) return;
    setIsProcessing(true);
    const targetUid = targetUser.uid || (targetUser as any).id;
    
    try {
        const batch = writeBatch(firestore);
        const userRef = doc(firestore, 'users', targetUid);
        
        batch.update(userRef, { 
          ownerIds: ownerIds, 
          ownerId: ownerIds[0] || null 
        });

        const oldOwnerIds = Array.isArray(targetUser.ownerIds) 
          ? targetUser.ownerIds 
          : (targetUser.ownerId ? [targetUser.ownerId] : []);
        
        const removedBosses = oldOwnerIds.filter(id => !ownerIds.includes(id));
        const addedBosses = ownerIds.filter(id => !oldOwnerIds.includes(id));

        for (const bossId of removedBosses) {
            batch.delete(doc(firestore, `users/${bossId}/teamMembers`, targetUid));
        }

        for (const bossId of addedBosses) {
            const memberRef = doc(firestore, `users/${bossId}/teamMembers`, targetUid);
            batch.set(memberRef, {
                id: targetUid,
                uid: targetUid,
                name: targetUser.name,
                email: targetUser.email,
                role: targetUser.role || 'Miembro',
                avatarUrl: targetUser.avatarUrl,
                phone: targetUser.phone || '',
                authType: 'email'
            });
        }

        await batch.commit();
        toast({ title: '¡Estructura Actualizada!', description: `La jerarquía de ${targetUser.name} ha sido guardada.` });
        setSelectedUserForTeams(null);
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
        setIsProcessing(false);
    }
  };

  const togglePermission = async (targetUid: string, field: 'canAccessBanks' | 'canAccessInvestors' | 'canAccessProjects', currentVal: boolean) => {
    if (!firestore) return;
    const userRef = doc(firestore, 'users', targetUid);
    try {
        await updateDoc(userRef, { [field]: !currentVal });
        toast({ title: 'Permiso actualizado' });
    } catch (e) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el permiso.' });
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex justify-between items-center">
         <div>
            <h2 className="text-2xl font-bold">Estructura Global</h2>
            <p className="text-muted-foreground text-sm">Administra la jerarquía y accesos de toda la organización.</p>
         </div>
         <Button onClick={() => setIsNewUserDialogOpen(true)} className="gap-2">
            <UserPlus size={18}/> Crear Nuevo Usuario
         </Button>
      </div>

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
                        <TableCell><Badge variant="outline" className="text-[10px] uppercase font-bold">{u.role}</Badge></TableCell>
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
                        <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedUserForEdit(u)} className="h-8 gap-2">
                                <Edit size={14}/> Perfil
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedUserForTeams(u)} className="h-8 gap-2">
                                <Users size={14}/> Equipo
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                        <Trash2 size={16}/>
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Esta acción borrará permanentemente la cuenta de <strong>{u.name}</strong>, su perfil y su membresía en cualquier equipo. Esta acción no se puede deshacer.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteUser(u.id)} className="bg-destructive hover:bg-destructive/90">
                                            Confirmar Eliminación
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
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
          isProcessing={isProcessing}
        />
      )}

      {selectedUserForEdit && (
        <AdminEditUserDialog
            user={selectedUserForEdit}
            onClose={() => setSelectedUserForEdit(null)}
            onSave={async (uid: string, data: any) => {
                await updateDoc(doc(firestore!, 'users', uid), data);
                setSelectedUserForEdit(null);
                toast({ title: 'Perfil guardado' });
            }}
        />
      )}

      {isNewUserDialogOpen && (
          <AdminNewUserDialog 
            isOpen={isNewUserDialogOpen}
            onClose={() => setIsNewUserDialogOpen(false)}
            leaders={allUsers?.filter(u => u.isTeamLeader) || []}
          />
      )}
    </div>
  );
}

function AdminNewUserDialog({ isOpen, onClose, leaders }: { isOpen: boolean, onClose: () => void, leaders: UserProfile[] }) {
    const { toast } = useToast();
    const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<AdminNewUserValues>({
        resolver: zodResolver(adminNewUserSchema),
        defaultValues: { useLink: true, bossId: null }
    });

    const useLink = watch('useLink');

    const onSubmit: SubmitHandler<AdminNewUserValues> = async (data) => {
        try {
            const functions = getFunctions();
            const registerFunction = httpsCallable(functions, 'registerTeamMember');
            
            const result = await registerFunction({
                email: data.email,
                name: data.name,
                role: data.role,
                phone: data.phone || '',
                inviterId: data.bossId === 'none' ? null : data.bossId,
                inviterName: 'Un Administrador',
                password: data.useLink ? null : data.password,
            });

            const responseData = result.data as any;
            if (responseData.warning) {
                toast({ variant: 'default', title: 'Usuario Creado con Advertencia', description: responseData.warning });
            } else {
                toast({ title: 'Usuario Creado', description: data.useLink ? 'Se envió la liga de acceso al correo.' : 'Cuenta lista con la contraseña asignada.' });
            }
            onClose();
        } catch (error: any) {
            console.error("Registration error:", error);
            // Mostrar mensaje de error específico si viene del servidor
            const errorMessage = error.message || 'Error inesperado al registrar el usuario.';
            toast({ 
                variant: 'destructive', 
                title: 'Error de Registro', 
                description: errorMessage 
            });
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><UserPlus className="text-primary"/> Nuevo Integrante</DialogTitle>
                    <DialogDescription>Completa los datos del nuevo miembro y define su jerarquía inicial.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label>Nombre Completo</Label>
                        <Input {...register('name')} placeholder="Ej. Juan Pérez" />
                        {errors.name && <p className="text-[10px] text-destructive">{errors.name.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label>Correo Electrónico</Label>
                        <Input type="email" {...register('email')} placeholder="usuario@fiscalflow.mx" />
                        {errors.email && <p className="text-[10px] text-destructive">{errors.email.message}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Rol / Cargo</Label>
                            <Input {...register('role')} placeholder="Contador..." />
                            {errors.role && <p className="text-[10px] text-destructive">{errors.role.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>Teléfono</Label>
                            <Input {...register('phone')} placeholder="+52..." />
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <Label>Jefe Inmediato (Asignación Directa)</Label>
                        <Select onValueChange={(v) => setValue('bossId', v === 'none' ? null : v)}>
                            <SelectTrigger><SelectValue placeholder="Seleccionar jefe..."/></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Sin jefe (Independiente)</SelectItem>
                                {leaders.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="p-4 bg-muted/30 rounded-xl border border-dashed space-y-4">
                        <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-2"><Key size={14}/> Enviar liga por correo</Label>
                            <Switch checked={useLink} onCheckedChange={(v) => setValue('useLink', v)} />
                        </div>
                        {!useLink && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                                <Label>Contraseña Manual</Label>
                                <div className="relative">
                                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                    <Input type="text" {...register('password')} className="pl-9" placeholder="Mínimo 6 caracteres..." />
                                </div>
                                <p className="text-[10px] text-muted-foreground italic">Deberás entregar esta clave manualmente al usuario.</p>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="pt-4 border-t">
                        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? (
                                <><Loader2 size={16} className="animate-spin mr-2"/> Procesando...</>
                            ) : (
                                <><Send size={16} className="mr-2"/> Dar de Alta</>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
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
  const [currentBossIds, setCurrentBossIds] = useState<string[]>(() => {
    if (Array.isArray(user?.ownerIds)) return user.ownerIds;
    if (user?.ownerId) return [user.ownerId];
    return [];
  });

  const leaders = useMemo(() => {
    const userUid = user?.uid || (user as any)?.id;
    return allUsers.filter((u: any) => {
      const uUid = u.uid || u.id;
      return uUid !== userUid && u.isTeamLeader;
    });
  }, [allUsers, user]);

  const toggleBoss = (bossId: string) => {
    const safeBossIds = Array.isArray(currentBossIds) ? currentBossIds : [];
    
    if (safeBossIds.includes(bossId)) {
        setCurrentBossIds(prev => prev.filter(id => id !== bossId));
    } else {
        if (safeBossIds.length < 2) {
            setCurrentBossIds(prev => [...(Array.isArray(prev) ? prev : []), bossId]);
        }
    }
  };

  const isSelected = (bossId: string) => {
    return Array.isArray(currentBossIds) && currentBossIds.includes(bossId);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
            <DialogTitle>Asignar Jefes para {user?.name}</DialogTitle>
            <DialogDescription>Selecciona hasta 2 líderes que podrán asignar y ver las tareas de este usuario.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 my-4 max-h-60 overflow-y-auto pr-2">
            {leaders.map((boss: any) => {
                const bossId = boss.uid || boss.id;
                const active = isSelected(bossId);
                return (
                    <div 
                        key={bossId} 
                        onClick={() => toggleBoss(bossId)} 
                        className={cn(
                            "p-3 border rounded-md cursor-pointer flex items-center justify-between transition-colors", 
                            active ? "border-primary bg-primary/5 shadow-sm" : "hover:bg-muted"
                        )}
                    >
                        <div className="flex items-center gap-3">
                            <Avatar className="h-6 w-6">
                                <AvatarImage src={boss.avatarUrl} />
                                <AvatarFallback>{boss.name?.[0]}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">{boss.name}</span>
                        </div>
                        {active && <Star className="h-4 w-4 fill-primary text-primary" />}
                    </div>
                );
            })}
            {leaders.length === 0 && (
                <p className="text-center py-6 text-xs text-muted-foreground italic">No hay líderes marcados disponibles.</p>
            )}
        </div>
        <DialogFooter>
            <Button variant="ghost" onClick={onClose} disabled={isProcessing}>Cancelar</Button>
            <Button onClick={() => onSave(user, currentBossIds)} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
                Guardar Cambios
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
