'use client';

import React, { useState, useRef, useMemo, useEffect } from 'react';
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
import { Trash2, Edit, Loader2, ImageUp, Crown, Link2, Copy, Check } from 'lucide-react';
import { type TeamMember, type UserProfile } from '@/lib/types';
import { useCollection, useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, deleteDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
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
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { copyToClipboard } from '@/lib/copy-to-clipboard';
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
              disabled
              className="disabled:opacity-100 disabled:cursor-not-allowed bg-muted/50"
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
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [bosses, setBosses] = useState<UserProfile[]>([]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (user && firestore) {
        const userDocRef = doc(firestore, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const profile = userDocSnap.data() as UserProfile;
          
          const bossIds = profile.ownerIds || (profile.ownerId ? [profile.ownerId] : []);
          if (bossIds.length > 0) {
            const bossData: UserProfile[] = [];
            for (const id of bossIds) {
                const ownerDocRef = doc(firestore, 'users', id);
                const ownerDocSnap = await getDoc(ownerDocRef);
                if (ownerDocSnap.exists()) {
                    bossData.push({ ...ownerDocSnap.data() as UserProfile, uid: ownerDocSnap.id });
                }
            }
            setBosses(bossData);
          }
        }
      }
    };
    fetchProfile();
  }, [user, firestore]);
  

  const myTeamCollectionPath = useMemo(() => {
    return user ? `users/${user.uid}/teamMembers` : null;
  }, [user]);

  const myTeamCollectionRef = useMemoFirebase(() => {
    return myTeamCollectionPath ? collection(firestore, myTeamCollectionPath) : null;
  }, [myTeamCollectionPath, firestore]);

  const { data: myTeamMembers, loading: myTeamLoading } = useCollection<TeamMember>(myTeamCollectionRef);

  const [isEditMemberDialogOpen, setIsEditMemberDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  const editMember = (member: TeamMember) => {
    setSelectedMember(member);
    setIsEditMemberDialogOpen(true);
  };

  const handleSaveMember = async (id: string, data: MemberFormValues) => {
    const pathToUpdate = `users/${user.uid}/teamMembers`;
    if (!user) return;
    const docRef = doc(firestore, pathToUpdate, id);
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
    const pathToUpdate = `users/${user.uid}/teamMembers`;
     if (!user) return;
    const docRef = doc(firestore, pathToUpdate, id);
    deleteDoc(docRef).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: docRef.path,
        operation: 'delete',
      });
      errorEmitter.emit('permission-error', permissionError);
    });
  };

  const [generatingLinkFor, setGeneratingLinkFor] = useState<string | null>(null);
  const [activeLink, setActiveLink] = useState<{ name: string; link: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Genera bajo demanda una liga nueva (Admin SDK en backend). No se guarda ni modifica al miembro.
  // La autorización (jefe directo / admin) se valida en la Function.
  const handleGeneratePasswordLink = async (member: TeamMember) => {
    const targetUid = member.uid || member.id;
    if (!targetUid || generatingLinkFor) return;
    setGeneratingLinkFor(targetUid);
    setLinkCopied(false);
    try {
      const linkFunction = httpsCallable(getFunctions(), 'generatePasswordLink');
      const result = await linkFunction({ uid: targetUid, email: member.email });
      const data = result.data as { resetLink?: string };
      if (!data.resetLink) throw new Error('No se recibió la liga.');
      setActiveLink({ name: member.name, link: data.resetLink });
    } catch (error: any) {
      console.error('Password link error:', error?.code, error?.message);
      let description = 'No se pudo generar la liga. Inténtalo de nuevo.';
      if (error?.code === 'functions/permission-denied') {
        description = 'No tienes permiso para generar la liga de este usuario.';
      } else if (error?.code === 'functions/not-found') {
        description = 'El usuario no existe en Firebase Authentication.';
      } else if (error?.code === 'functions/unauthenticated') {
        description = 'Tu sesión expiró. Vuelve a iniciar sesión.';
      } else if (error?.message && error.message !== 'internal') {
        description = error.message;
      }
      toast({ variant: 'destructive', title: 'Error al generar liga', description });
    } finally {
      setGeneratingLinkFor(null);
    }
  };

  const handleCopyActiveLink = async () => {
    if (!activeLink) return;
    const ok = await copyToClipboard(activeLink.link);
    if (ok) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } else {
      toast({ variant: 'destructive', title: 'No se pudo copiar', description: 'Selecciona la liga y cópiala manualmente.' });
    }
  };

  const isLoading = isUserLoading || myTeamLoading;

  return (
    <>
      <div className="h-full space-y-4">
        {bosses.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bosses.map((boss) => (
                    <Card key={boss.uid}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Crown className="text-amber-500"/>
                                Jefe de Equipo
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-4">
                                <Avatar className="h-16 w-16">
                                    <AvatarImage src={boss.avatarUrl} alt={boss.name} />
                                    <AvatarFallback>{boss.name?.charAt(0).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="text-lg font-bold">{boss.name}</p>
                                    <p className="text-muted-foreground">{boss.email}</p>
                                    <Badge variant="secondary" className="mt-1">{boss.role}</Badge>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        )}
        
        <Card>
            <CardHeader>
                <CardTitle>Miembros de mi Equipo</CardTitle>
                <CardDescription>
                    Aquí puedes ver y administrar los miembros que tú gestionas directamente.
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
                        myTeamMembers &&
                        myTeamMembers.map((member) => (
                            <TableRow key={member.uid || member.id}>
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
                                <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label="Liga contraseña"
                                                disabled={!!generatingLinkFor}
                                                onClick={(e) => { e.stopPropagation(); handleGeneratePasswordLink(member); }}
                                            >
                                                {generatingLinkFor === (member.uid || member.id)
                                                    ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                                    : <Link2 className="h-4 w-4 text-muted-foreground" />}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Liga contraseña</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => { e.stopPropagation(); editMember(member); }}
                                >
                                    <Edit className="h-4 w-4 text-muted-foreground" />
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon">
                                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                        <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Esta acción no se puede deshacer. Se eliminará permanentemente al miembro <span className="font-bold">{member.name}</span> del equipo.
                                        </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => deleteMember(member.id)} className="bg-destructive hover:bg-destructive/90">Eliminar</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </TableCell>
                            </TableRow>
                        ))}
                        {!isLoading && (!myTeamMembers || myTeamMembers.length === 0) && (
                        <TableRow>
                            <TableCell
                            colSpan={4}
                            className="text-center py-10 text-muted-foreground"
                            >
                            No has invitado a nadie a tu equipo todavía.
                            </TableCell>
                        </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>
      {activeLink && (
        <Dialog open onOpenChange={() => setActiveLink(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" /> Liga para definir contraseña
              </DialogTitle>
              <DialogDescription>
                Liga de acceso generada para <strong>{activeLink.name}</strong>. Compártela con el usuario para que defina su contraseña.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Input readOnly value={activeLink.link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <Button type="button" onClick={handleCopyActiveLink} className="shrink-0 gap-2">
                {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {linkCopied ? 'Copiada' : 'Copiar Liga'}
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setActiveLink(null)}>Cerrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <EditMemberDialog
        isOpen={isEditMemberDialogOpen}
        onOpenChange={setIsEditMemberDialogOpen}
        member={selectedMember}
        onSave={handleSaveMember}
      />
    </>
  );
}