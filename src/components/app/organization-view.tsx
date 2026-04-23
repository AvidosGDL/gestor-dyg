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
import { Search, Loader2, Star, StarOff, Users, Edit, ImageUp, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Label } from '../ui/label';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';

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
        setSelectedUserForTeams(null);
    } catch (error: any) {
        console.error("Error updating organization:", error);
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
        setIsAssigning(false);
    }
  };

  const handleSaveUserProfile = async (uid: string, data: AdminEditUserValues) => {
    if (!firestore) return;
    const userRef = doc(firestore, 'users', uid);
    try {
        await updateDoc(userRef, data);
        toast({ title: 'Perfil actualizado', description: `Los datos de ${data.name} han sido guardados.` });
        setSelectedUserForEdit(null);
    } catch (e: any) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo actualizar el perfil.' });
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
          <CardDescription>Administra los perfiles de usuario, quiénes son líderes y ajusta los equipos de trabajo.</CardDescription>
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
                  <TableRow key={(u as any).id || u.uid}>
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
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedUserForEdit(u)} className="h-8 gap-2">
                          <Edit size={14}/>
                          Editar Perfil
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedUserForTeams(u)} className="h-8 gap-2">
                          <Users size={14}/>
                          Ajustar Equipo
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
            onSave={handleSaveUserProfile}
        />
      )}
    </div>
  );
}

function AdminEditUserDialog({ user, onClose, onSave }: { user: UserProfile, onClose: () => void, onSave: (uid: string, data: AdminEditUserValues) => Promise<void> }) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [customAvatarFile, setCustomAvatarFile] = useState<string | null>(null);
    const [customAvatarPreview, setCustomAvatarPreview] = useState<string | null>(null);
    
    const avatarOptions = useMemo(() => {
        return Array.from({ length: AVATAR_OPTIONS }, (_, i) => generateAvatarUrl(`avatar-${i}`));
    }, []);

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<AdminEditUserValues>({
        resolver: zodResolver(adminEditUserSchema),
        defaultValues: {
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone || '',
            avatarUrl: user.avatarUrl,
        }
    });

    const selectedAvatarUrl = watch('avatarUrl');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result as string;
                setCustomAvatarFile(dataUrl);
                setCustomAvatarPreview(dataUrl);
                setValue('avatarUrl', dataUrl, { shouldValidate: true });
            };
            reader.readAsDataURL(file);
        }
    };

    const uploadAvatar = async (uid: string, dataUrl: string): Promise<string> => {
        const storage = getStorage();
        const avatarRef = storageRef(storage, `avatars/${uid}/${Date.now()}`);
        await uploadString(avatarRef, dataUrl, 'data_url');
        return getDownloadURL(avatarRef);
    }

    const onSubmit: SubmitHandler<AdminEditUserValues> = async (data) => {
        let finalAvatarUrl = data.avatarUrl;
        if (customAvatarFile) {
            finalAvatarUrl = await uploadAvatar(user.uid || (user as any).id, customAvatarFile);
        }
        await onSave(user.uid || (user as any).id, { ...data, avatarUrl: finalAvatarUrl });
    };

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Editar Perfil de Usuario</DialogTitle>
                    <DialogDescription>Como superadministrador, puedes modificar la información de cualquier usuario.</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label>Avatar</Label>
                        <div className="grid grid-cols-4 gap-2">
                            {avatarOptions.map((url, index) => (
                                <button
                                    key={index}
                                    type="button"
                                    onClick={() => {
                                        setValue('avatarUrl', url, { shouldValidate: true });
                                        setCustomAvatarPreview(null);
                                        setCustomAvatarFile(null);
                                    }}
                                    className={cn(
                                        "rounded-full p-1 transition-all",
                                        selectedAvatarUrl === url && !customAvatarPreview ? 'ring-2 ring-primary ring-offset-2' : 'ring-1 ring-transparent hover:ring-primary/50'
                                    )}
                                >
                                    <Avatar className="h-12 w-12">
                                        <AvatarImage src={url} alt={`Avatar ${index + 1}`} />
                                    </Avatar>
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className={cn(
                                    "rounded-full p-1 transition-all flex items-center justify-center bg-muted hover:bg-border",
                                    customAvatarPreview ? 'ring-2 ring-primary ring-offset-2' : 'ring-1 ring-transparent hover:ring-primary/50'
                                )}
                            >
                                <Avatar className="h-12 w-12">
                                    {customAvatarPreview ? (
                                        <AvatarImage src={customAvatarPreview} alt="Avatar personalizado" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <ImageUp className="w-6 h-6 text-muted-foreground" />
                                        </div>
                                    )}
                                </Avatar>
                            </button>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="admin-edit-name">Nombre Completo</Label>
                        <Input id="admin-edit-name" {...register('name')} />
                        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="admin-edit-email">Correo Electrónico</Label>
                        <Input id="admin-edit-email" {...register('email')} />
                        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="admin-edit-role">Rol o Cargo</Label>
                        <Input id="admin-edit-role" {...register('role')} />
                        {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="admin-edit-phone">Teléfono</Label>
                        <Input id="admin-edit-phone" {...register('phone')} />
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar Cambios
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
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