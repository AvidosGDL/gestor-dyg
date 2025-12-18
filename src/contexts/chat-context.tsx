'use client';

import React, { createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import type { Chat, Message, UserProfile, TeamMember } from '@/lib/types';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import {
  collection,
  query,
  where,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  orderBy,
  getDocs,
  getDoc,
  writeBatch,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface ChatContextType {
  conversations: Chat[];
  teamMembers: TeamMember[];
  getMessagesForConversation: (chatId: string | null) => { messages: Message[], loading: boolean };
  sendMessage: (chatId: string, message: Partial<Message>) => void;
  getOrCreateConversation: (memberId: string) => Promise<string | null>;
  unreadCount: number;
  loading: boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const [processedConversations, setProcessedConversations] = useState<Chat[]>([]);

  const chatsQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    const chatsCollectionRef = collection(firestore, 'chats');
    return query(
      chatsCollectionRef,
      where('memberIds', 'array-contains', user.uid),
      orderBy('lastMessageTimestamp', 'desc')
    );
  }, [user, firestore]);

  const { data: rawConversations, loading: chatsLoading } = useCollection<Chat>(chatsQuery);
  
  const teamMembersCollectionPath = user ? `users/${user.uid}/teamMembers` : null;
  const teamMembersCollectionRef = useMemoFirebase(() => {
      return teamMembersCollectionPath ? collection(firestore, teamMembersCollectionPath) : null;
  }, [teamMembersCollectionPath, firestore]);

  const { data: teamMembers, loading: membersLoading } = useCollection<TeamMember>(teamMembersCollectionRef);
  
  useEffect(() => {
    if (!rawConversations || !firestore || !user) {
        setProcessedConversations([]);
        return;
    }

    let isMounted = true;

    const processConversations = async () => {
        const batch = writeBatch(firestore);
        let batchHasWrites = false;

        const enrichedConversations = await Promise.all(rawConversations.map(async (convo) => {
            const newMembersData: Chat['members'] = { ...convo.members };
            let needsUpdateInFirestore = false;

            for (const memberId of convo.memberIds) {
                const memberInfo = newMembersData[memberId];
                
                if (!memberInfo || !memberInfo.name || memberInfo.name === 'Usuario' || !memberInfo.email) {
                    try {
                        const userDocRef = doc(firestore, 'users', memberId);
                        const userDocSnap = await getDoc(userDocRef);

                        if (userDocSnap.exists()) {
                            const userData = userDocSnap.data() as UserProfile;
                            newMembersData[memberId] = { name: userData.name, avatarUrl: userData.avatarUrl, email: userData.email };
                            needsUpdateInFirestore = true;
                        } else {
                            console.error(`[ChatContext] No se encontró el perfil para el miembro con ID: ${memberId}. Intentando auto-corrección.`);
                            const memberEmailToFind = memberInfo?.email;
                            
                            if (memberEmailToFind) {
                                const usersQuery = query(collection(firestore, 'users'), where('email', '==', memberEmailToFind));
                                const userSnap = await getDocs(usersQuery);
                                if (!userSnap.empty) {
                                    const correctUserDoc = userSnap.docs[0];
                                    const correctUid = correctUserDoc.id;
                                    const correctUserData = correctUserDoc.data() as UserProfile;

                                    delete newMembersData[memberId];
                                    newMembersData[correctUid] = { name: correctUserData.name, avatarUrl: correctUserData.avatarUrl, email: correctUserData.email };
                                    
                                    const chatDocRef = doc(firestore, 'chats', convo.id);
                                    const newMemberIds = convo.memberIds.map(id => id === memberId ? correctUid : id);
                                    
                                    batch.update(chatDocRef, { memberIds: newMemberIds, members: newMembersData });
                                    batchHasWrites = true;
                                    console.log(`[ChatContext] Auto-corrección exitosa. ID ${memberId} -> ${correctUid}`);
                                }
                            } else {
                               newMembersData[memberId] = newMembersData[memberId] || { name: 'Usuario Desconocido', avatarUrl: '', email: '' };
                            }
                        }
                    } catch (error) {
                        console.error(`[ChatContext] Falló la obtención del perfil para el miembro ${memberId}:`, error);
                        newMembersData[memberId] = newMembersData[memberId] || { name: 'Error al Cargar', avatarUrl: '', email: '' };
                    }
                }
            }
            
            if (needsUpdateInFirestore && !batchHasWrites) { // Solo actualiza si no se hizo una corrección de ID más importante
                const chatDocRef = doc(firestore, 'chats', convo.id);
                batch.update(chatDocRef, { members: newMembersData });
                batchHasWrites = true;
            }

            return { ...convo, members: newMembersData };
        }));

        if (batchHasWrites) {
            await batch.commit().catch(err => console.error("[ChatContext] Falló el batch de auto-corrección de miembros del chat:", err));
        }

        if (isMounted) {
            setProcessedConversations(enrichedConversations);
        }
    };

    processConversations();

    return () => {
        isMounted = false;
    };
  }, [rawConversations, firestore, user]);

  
  const unreadCount = useMemo(() => {
    return (processedConversations || []).filter(c => 
      c.lastMessage && 
      c.lastMessage.senderId !== user?.uid &&
      !c.lastMessage.readBy?.includes(user!.uid)
    ).length;
  }, [processedConversations, user]);


  const getMessagesForConversation = (chatId: string | null) => {
    const messagesCollectionRef = useMemoFirebase(() => {
      if (!firestore || !chatId) return null;
      return collection(firestore, `chats/${chatId}/messages`);
    }, [firestore, chatId]);

    const messagesQuery = useMemoFirebase(() => {
      if (!messagesCollectionRef) return null;
      return query(messagesCollectionRef, orderBy('timestamp', 'asc'));
    }, [messagesCollectionRef]);
    
    const { data: messages, loading } = useCollection<Message>(messagesQuery);
    
    useEffect(() => {
        if (messages && messages.length > 0 && user && chatId) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.senderId !== user.uid && !lastMessage.readBy?.includes(user.uid)) {
                const chatDocRef = doc(firestore, 'chats', chatId);
                updateDoc(chatDocRef, {
                    'lastMessage.readBy': [...(lastMessage.readBy || []), user.uid]
                });
            }
        }
    }, [messages, user, chatId, firestore]);

    
    if (!chatId) {
      return { messages: [], loading: false };
    }
    
    return { messages: messages || [], loading };
  };
  
  const sendMessage = (chatId: string, message: Partial<Message>) => {
    if (!firestore || !user) return;
    
    const messagesCollectionRef = collection(firestore, `chats/${chatId}/messages`);
    const chatDocRef = doc(firestore, `chats/${chatId}`);
    const timestamp = serverTimestamp();

    const newMessage = {
      ...message,
      senderId: user.uid,
      timestamp: timestamp,
      readBy: [user.uid],
    };

    addDoc(messagesCollectionRef, newMessage).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: messagesCollectionRef.path,
        operation: 'create',
        requestResourceData: newMessage,
      });
      errorEmitter.emit('permission-error', permissionError);
    });

    updateDoc(chatDocRef, {
      lastMessage: {
        text: message.text,
        senderId: user.uid,
        readBy: [user.uid]
      },
      lastMessageTimestamp: timestamp,
    });
  };
  
  const getOrCreateConversation = async (memberId: string): Promise<string | null> => {
    if (!firestore || !user) return null;
    const chatsCollectionRef = collection(firestore, 'chats');

    const memberIds = [user.uid, memberId].sort();
    
    const existingChatQuery = query(
      chatsCollectionRef,
      where('memberIds', '==', memberIds)
    );

    try {
      const existingChatSnap = await getDocs(existingChatQuery);
      if (!existingChatSnap.empty) {
        return existingChatSnap.docs[0].id;
      }

      const userDocRef = doc(firestore, 'users', user.uid);
      const memberDocRef = doc(firestore, 'users', memberId);

      const [userDocSnap, memberDocSnap] = await Promise.all([getDoc(userDocRef), getDoc(memberDocRef)]);

      const userProfile = userDocSnap.exists() ? userDocSnap.data() as UserProfile : null;
      const memberProfile = memberDocSnap.exists() ? memberDocSnap.data() as UserProfile : null;
      
      if (!userProfile || !memberProfile) {
        console.error(`No se pudo crear la conversación. Perfil no encontrado para el usuario actual o el miembro ${memberId}.`);
        return null;
      }

      const newChatData: Omit<Chat, 'id'> = {
        memberIds: memberIds, 
        members: {
          [user.uid]: { name: userProfile.name, avatarUrl: userProfile.avatarUrl, email: userProfile.email },
          [memberId]: { name: memberProfile.name, avatarUrl: memberProfile.avatarUrl, email: memberProfile.email }
        },
        lastMessage: null,
        lastMessageTimestamp: serverTimestamp(),
      };

      const newChatDoc = await addDoc(chatsCollectionRef, newChatData);
      return newChatDoc.id;
    } catch (e: any) {
      console.error("Error creating or finding conversation", e);
       const permissionError = new FirestorePermissionError({
        path: chatsCollectionRef.path,
        operation: 'create',
        requestResourceData: { memberIds },
      });
      errorEmitter.emit('permission-error', permissionError);
      return null;
    }
  }


  const contextValue = useMemo(() => ({
    conversations: processedConversations,
    teamMembers: teamMembers || [],
    loading: chatsLoading || membersLoading || (rawConversations && processedConversations.length !== rawConversations.length),
    getMessagesForConversation,
    sendMessage,
    getOrCreateConversation,
    unreadCount,
  }), [processedConversations, teamMembers, chatsLoading, membersLoading, rawConversations, unreadCount]);

  return (
    <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
