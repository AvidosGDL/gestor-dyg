'use client';

import React, { useState, useRef, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Trash2, Edit, Loader2, ImageUp, Wand2 } from 'lucide-react';
import { type TeamMember } from '@/lib/types';
import { useCollection, useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, deleteDoc, doc, updateDoc, writeBatch, getDocs, query, where } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '../ui/alert-dialog';


const AVATAR_OPTIONS = 7;
const avatarCollection = 'lorelei';
const generateAvatarUrl = (seed: string) => `https://api.dicebear.com/8.x/${avatarCollection}/svg?seed=${seed}`;

const memberSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('El correo electrónico no es válido'),
  role: z.string().min(1, 'El rol es requerido'),
  phone: z.string().optional(),
  avatarUrl: z.string().url('Por favor, selecciona un avatar'),
  uid: z.string(),
});

type MemberFormValues = z.infer<typeof memberSchema>;

function EditMemberDialog({
  member,
  isOpen,
  onOpenChange,
  onSave,
}: {
  member: TeamMember | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave: (id: string, data: MemberFormValues) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customAvatarFile, setCustomAvatarFile] = useState<string | null>(null);
  const [customAvatarPreview, setCustomAvatarPreview] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema),
  });

  const selectedAvatarUrl = watch('avatarUrl');

  const avatarOptions = React.useMemo(() => {
    return Array.from({ length: AVATAR_OPTIONS }, (_, i) => generateAvatarUrl(`avatar-${i}`));
  }, []);

  React.useEffect(() => {
    if (member && isOpen) {
      reset(member);
      if (member.avatarUrl && !avatarOptions.includes(member.avatarUrl)) {
        setCustomAvatarPreview(member.avatarUrl);
      } else {
        setCustomAvatarPreview(null);
      }
      setCustomAvatarFile(null);
    }
  }, [member, isOpen, reset, avatarOptions]);

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
  
  const uploadAvatar = async (email: string, dataUrl: string): Promise<string> => {
    const storage = getStorage();
    const avatarRef = storageRef(storage, `avatars/${email}/${Date.now()}`);
    await uploadString(avatarRef, dataUrl, 'data_url');
    return getDownloadURL(avatarRef);
  }

  const handleSave: SubmitHandler<MemberFormValues> = async (data) => {
    if (member) {
      let finalAvatarUrl = data.avatarUrl;
      if (customAvatarFile) {
        finalAvatarUrl = await uploadAvatar(member.email, customAvatarFile);
      }
      onSave(member.id, {...data, avatarUrl: finalAvatarUrl});
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Miembro del Equipo</DialogTitle>
          <DialogDescription>
            Actualiza los detalles y el avatar del miembro del equipo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
          <div className="space-y-2">
            <Label>Avatar</Label>
            <div className="grid grid-cols-4 gap-4">
              {avatarOptions.map((url, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    setValue('avatarUrl', url, { shouldValidate: true });
                    setCustomAvatarPreview(null);
                  }}
                  className={cn(
                    "rounded-full p-1 transition-all",
                    selectedAvatarUrl === url && !customAvatarPreview
                      ? 'ring-2 ring-primary ring-offset-2'
                      : 'ring-1 ring-transparent hover:ring-primary/50'
                  )}
                >
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={url} alt={`Avatar ${index + 1}`} />
                  </Avatar>
                </button>
              ))}
               <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "rounded-full p-1 transition-all flex items-center justify-center bg-muted hover:bg-border",
                    customAvatarPreview
                      ? 'ring-2 ring-primary ring-offset-2'
                      : 'ring-1 ring-transparent hover:ring-primary/50'
                  )}
                >
                  <Avatar className="h-16 w-16">
                    {customAvatarPreview ? (
                      <AvatarImage src={customAvatarPreview} alt="Avatar personalizado" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageUp className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                  </Avatar>
                </button>
                <Input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/png, image/jpeg, image/gif"
                  onChange={handleFileChange}
                />
            </div>
            {errors.avatarUrl && (
              <p className="text-sm text-destructive">{errors.avatarUrl.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-name">Nombre Completo</Label>
            <Input
              id="edit-name"
              placeholder="Ej. Juan Pérez"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-email">Correo Electrónico</Label>
            <Input
              id="edit-email"
              type="email"
              placeholder="juan.perez@tuempresa.com"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-role">Rol</Label>
            <Input
              id="edit-role"
              placeholder="Ej. Diseñador Gráfico"
              {...register('role')}
            />
            {errors.role && (
              <p className="text-sm text-destructive">{errors.role.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-phone">Teléfono</Label>
            <Input
              id="edit-phone"
              placeholder="Ej. +1 234 567 890"
              {...register('phone')}
            />
            {errors.phone && (
              <p className="text-sm text-destructive">{errors.phone.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
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

export default function TeamView() {
  const { user, loading: userLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isMigrating, setIsMigrating] = useState(false);

  const collectionPath = user ? `users/${user.uid}/teamMembers` : null;
  const membersCollectionRef = useMemoFirebase(() => {
    return collectionPath ? collection(firestore, collectionPath) : null;
  }, [collectionPath, firestore]);
  
  const { data: members, loading: membersLoading } =
    useCollection<TeamMember>(membersCollectionRef);

  const [isEditMemberDialogOpen, setIsEditMemberDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  const editMember = (member: TeamMember) => {
    setSelectedMember(member);
    setIsEditMemberDialogOpen(true);
  };

  const handleSaveMember = async (id: string, data: MemberFormValues) => {
    if (!collectionPath) return;
    const docRef = doc(firestore, collectionPath, id);
    const updatedData = { ...data };
    try {
      await updateDoc(docRef, updatedData);
      toast({
        title: 'Miembro Actualizado',
        description: `Los datos de ${updatedData.name} han sido actualizados.`,
      });
      setIsEditMemberDialogOpen(false);
      setSelectedMember(null);
    } catch (serverError) {
      const permissionError = new FirestorePermissionError({
        path: docRef.path,
        operation: 'update',
        requestResourceData: updatedData,
      });
      errorEmitter.emit('permission-error', permissionError);
    }
  };

  const deleteMember = (id: string) => {
    if (!collectionPath) return;
    const docRef = doc(firestore, collectionPath, id);
    deleteDoc(docRef).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: docRef.path,
        operation: 'delete',
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  };

  const handleMigration = async () => {
    if (!firestore || !user || !members) return;
    setIsMigrating(true);
    toast({ title: 'Iniciando migración...', description: 'Esto puede tardar unos segundos.' });

    try {
        const tasksRef = collection(firestore, "tasks");
        // Query only for tasks owned by the current admin/user.
        const ownerTasksQuery = query(tasksRef, where('ownerId', '==', user.uid));
        
        const [tasksSnap] = await Promise.all([
            getDocs(ownerTasksQuery),
        ]);

        // Build the email -> uid map from the local 'members' state.
        const emailToUidMap = new Map(members.map(m => [m.email, m.uid]));
        
        const batch = writeBatch(firestore);
        let updatedCount = 0;

        tasksSnap.forEach(taskDoc => {
            const task = taskDoc.data() as any;
            // Check if task is delegated by email but has a missing or incorrect delegateToId
            if (task.delegateToEmail && (!task.delegateToId || task.delegateToId !== emailToUidMap.get(task.delegateToEmail))) {
                const correctUid = emailToUidMap.get(task.delegateToEmail);
                if (correctUid) {
                    const taskRef = doc(firestore, "tasks", taskDoc.id);
                    batch.update(taskRef, { delegateToId: correctUid });
                    updatedCount++;
                }
            }
        });


        if (updatedCount > 0) {
            await batch.commit();
            toast({ title: '¡Migración completada!', description: `${updatedCount} tareas han sido actualizadas.` });
        } else {
            toast({ title: 'Migración finalizada', description: 'No se encontraron tareas para actualizar en tu cuenta.' });
        }

    } catch (error: any) {
        console.error("Error durante la migración: ", error);
        toast({
            variant: "destructive",
            title: 'Error en la migración',
            description: error.message || 'Ocurrió un error inesperado.'
        });
    } finally {
        setIsMigrating(false);
    }
};

  const isLoading = userLoading || membersLoading;
  const isAdmin = user?.email === 'gdldanny@gmail.com';

  return (
    <>
      <div className="h-full space-y-4">
        {isAdmin && (
            <Card>
                 <CardHeader>
                    <CardTitle>Panel de Administrador</CardTitle>
                    <CardDescription>Herramientas especiales para la gestión del sistema.</CardDescription>
                </CardHeader>
                <CardContent>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button disabled={isMigrating}>
                                {isMigrating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                                Migrar Delegaciones de Tareas
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>¿Confirmar Migración de Datos?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción es irreversible. Se intentará actualizar todas las tareas existentes para usar el nuevo sistema de delegación por UID de usuario. Este proceso se debe ejecutar una sola vez para corregir datos antiguos.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={handleMigration}>Sí, iniciar migración</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <p className="text-xs text-muted-foreground mt-2">
                        Esta herramienta corrige las tareas antiguas para que apunten al UID del usuario delegado en lugar de un ID de documento obsoleto.
                    </p>
                </CardContent>
            </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Miembros del Equipo</CardTitle>
            <CardDescription>
              Aquí puedes ver y administrar los miembros de tu equipo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Miembro</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">
                      <div className="flex justify-center items-center p-4">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading &&
                  members &&
                  members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage
                              src={member.avatarUrl}
                              alt={member.name}
                            />
                            <AvatarFallback>
                              {member.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{member.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {member.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{member.role}</Badge>
                      </TableCell>
                       <TableCell>
                         <Badge variant="outline">Activo</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); editMember(member); }}
                        >
                          <Edit className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); deleteMember(member.id); }}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                {!isLoading && (!members || members.length === 0) && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-10 text-muted-foreground"
                    >
                      No hay miembros en el equipo todavía. Haz clic en "Nuevo Miembro" para agregar uno.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <EditMemberDialog
        isOpen={isEditMemberDialogOpen}
        onOpenChange={setIsEditMemberDialogOpen}
        member={selectedMember}
        onSave={handleSaveMember}
      />
    </>
  );
}
