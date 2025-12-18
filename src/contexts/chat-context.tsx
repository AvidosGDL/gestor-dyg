
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
            let memberIdsCorrected = false;
            const newMemberIds = [...convo.memberIds];

            for (let i = 0; i < newMemberIds.length; i++) {
                let memberId = newMemberIds[i];
                let memberInfo = newMembersData[memberId];

                // Check if info is missing or incomplete
                if (!memberInfo || !memberInfo.name || memberInfo.name === 'Usuario' || !memberInfo.email || memberInfo.name === null) {
                    try {
                        const userDocRef = doc(firestore, 'users', memberId);
                        const userDocSnap = await getDoc(userDocRef);

                        if (userDocSnap.exists()) {
                            const userData = userDocSnap.data() as UserProfile;
                            newMembersData[memberId] = { name: userData.name, avatarUrl: userData.avatarUrl, email: userData.email };
                            needsUpdateInFirestore = true;
                        } else {
                             // SELF-HEALING ATTEMPT: User not found by ID. Try to find by email.
                             const memberEmailToFind = convo.members?.[memberId]?.email;
                             
                             if (memberEmailToFind) {
                                const usersQuery = query(collection(firestore, 'users'), where('email', '==', memberEmailToFind));
                                const userSnap = await getDocs(usersQuery);
                                if (!userSnap.empty) {
                                    const correctUserDoc = userSnap.docs[0];
                                    const correctUid = correctUserDoc.id;
                                    const correctUserData = correctUserDoc.data() as UserProfile;

                                    // Replace incorrect ID with correct UID
                                    newMemberIds[i] = correctUid;
                                    delete newMembersData[memberId]; // Remove old incorrect data
                                    newMembersData[correctUid] = { name: correctUserData.name, avatarUrl: correctUserData.avatarUrl, email: correctUserData.email };
                                    
                                    memberIdsCorrected = true;
                                    needsUpdateInFirestore = true; // Mark for update
                                } else {
                                   newMembersData[memberId] = newMembersData[memberId] || { name: 'Usuario Desconocido', avatarUrl: '', email: '' };
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
            
            const finalMemberIds = memberIdsCorrected ? newMemberIds : convo.memberIds;

            if (needsUpdateInFirestore) { // Consolidate batch writes
                const chatDocRef = doc(firestore, 'chats', convo.id);
                batch.update(chatDocRef, { memberIds: finalMemberIds, members: newMembersData });
                batchHasWrites = true;
            }

            return { ...convo, memberIds: finalMemberIds, members: newMembersData };
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

    let resolvedMemberUid = memberId;
    const looksLikeUid = (s: any) => typeof s === 'string' && s.length >= 20 && !s.includes('/');

    if (!looksLikeUid(resolvedMemberUid)) {
      console.warn(`[ChatContext] Se recibió un ID inválido (${memberId}). Intentando resolver...`);
      const tmRef = doc(firestore, `users/${user.uid}/teamMembers/${memberId}`);
      const tmSnap = await getDoc(tmRef);
      if (tmSnap.exists()) {
        const tm = tmSnap.data() as TeamMember;
        if (tm.uid && looksLikeUid(tm.uid)) {
          resolvedMemberUid = tm.uid;
          console.log(`[ChatContext] ID resuelto a ${resolvedMemberUid} a través del campo 'uid'.`);
        } else if (tm.email) {
          console.log(`[ChatContext] Intentando resolver por email: ${tm.email}`);
          const q = query(collection(firestore, 'users'), where('email', '==', tm.email));
          const userSnap = await getDocs(q);
          if (!userSnap.empty) {
            resolvedMemberUid = userSnap.docs[0].id;
            console.log(`[ChatContext] ID resuelto a ${resolvedMemberUid} a través del email.`);
          }
        }
      }
    }
    
    if (!looksLikeUid(resolvedMemberUid)) {
        console.error(`[ChatContext] No se pudo resolver un UID válido para el ID: ${memberId}`);
        return null;
    }


    const chatsCollectionRef = collection(firestore, 'chats');
    const memberIds = [user.uid, resolvedMemberUid].sort();
    
    const existingChatQuery = query(
      chatsCollectionRef,
      where('memberIds', '==', memberIds)
    );

    try {
      const existingChatSnap = await getDocs(existingChatQuery);
      if (!existingChatSnap.empty) {
        return existingChatSnap.docs[0].id;
      }

      // Fetch full profiles to ensure correct data at creation
      const userDocRef = doc(firestore, 'users', user.uid);
      const memberDocRef = doc(firestore, 'users', resolvedMemberUid);

      const [userDocSnap, memberDocSnap] = await Promise.all([getDoc(userDocRef), getDoc(memberDocRef)]);

      const userProfile = userDocSnap.exists() ? userDocSnap.data() as UserProfile : null;
      const memberProfile = memberDocSnap.exists() ? memberDocSnap.data() as UserProfile : null;
      
      if (!userProfile || !memberProfile) {
        console.error(`No se pudo crear la conversación. Perfil no encontrado para el usuario actual o el miembro ${resolvedMemberUid}.`);
        return null;
      }

      const newChatData: Omit<Chat, 'id'> = {
        memberIds: memberIds, 
        members: {
          [user.uid]: { name: userProfile.name, avatarUrl: userProfile.avatarUrl, email: userProfile.email },
          [resolvedMemberUid]: { name: memberProfile.name, avatarUrl: memberProfile.avatarUrl, email: memberProfile.email }
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
