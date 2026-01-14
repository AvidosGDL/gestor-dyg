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
  type Firestore,
} from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import type { User } from 'firebase/auth';

interface ChatContextType {
  conversations: Chat[];
  teamMembers: TeamMember[];
  getMessagesForConversation: (chatId: string | null) => { messages: Message[], loading: boolean };
  sendMessage: (chatId: string, message: Partial<Message>, file?: File) => void;
  getOrCreateConversation: (memberId: string) => Promise<string | null>;
  unreadCount: number;
  loading: boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

async function fetchAndEnrichConversations(
  rawConversations: Chat[],
  firestore: Firestore,
) {
  const batch = writeBatch(firestore);
  let batchHasWrites = false;

  const enrichedConversations = await Promise.all(
    rawConversations.map(async (convo) => {
      const newMembersData: Chat['members'] = { ...convo.members };
      let needsUpdateInFirestore = false;

      for (const memberId of convo.memberIds) {
        const memberInfo = newMembersData[memberId];

        if (!memberInfo || !memberInfo.name || !memberInfo.avatarUrl || !memberInfo.email) {
          try {
            const userDocRef = doc(firestore, 'users', memberId);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
              const userData = userDocSnap.data() as UserProfile;
              newMembersData[memberId] = {
                name: userData.name,
                avatarUrl: userData.avatarUrl,
                email: userData.email,
              };
              needsUpdateInFirestore = true;
            } else {
              console.error(`[ChatContext] No profile found for member ID: ${memberId}.`);
              if (!newMembersData[memberId]) {
                newMembersData[memberId] = {
                  name: 'Usuario Desconocido',
                  avatarUrl: '',
                  email: '',
                };
                needsUpdateInFirestore = true;
              }
            }
          } catch (error) {
            console.error(`[ChatContext] Failed to fetch profile for member ${memberId}:`, error);
            if (!newMembersData[memberId]) {
              newMembersData[memberId] = {
                name: 'Error al Cargar',
                avatarUrl: '',
                email: '',
              };
              needsUpdateInFirestore = true;
            }
          }
        }
      }

      if (needsUpdateInFirestore) {
        const chatDocRef = doc(firestore, 'chats', convo.id);
        batch.update(chatDocRef, { members: newMembersData });
        batchHasWrites = true;
      }

      return { ...convo, members: newMembersData };
    })
  );

  if (batchHasWrites) {
    await batch
      .commit()
      .catch((err) => console.error('[ChatContext] Failed to commit chat member auto-correction batch:', err));
  }

  return enrichedConversations;
}


export function ChatProvider({ children }: { children: ReactNode }) {
  const firestore = useFirestore();
  const { user } = useUser();
  const [processedConversations, setProcessedConversations] = useState<Chat[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (user && firestore) {
        const userDocRef = doc(firestore, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const profile = userDocSnap.data() as UserProfile;
          setUserProfile(profile);
          if (profile.ownerId) {
            const ownerDocRef = doc(firestore, 'users', profile.ownerId);
            const ownerDocSnap = await getDoc(ownerDocRef);
            if (ownerDocSnap.exists()) {
              setOwnerProfile(ownerDocSnap.data() as UserProfile);
            }
          }
        }
      }
    };
    fetchProfile();
  }, [user, firestore]);

  const teamOwnerId = useMemo(() => {
    return userProfile?.ownerId || user?.uid;
  }, [userProfile, user]);

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
  
  const teamMembersCollectionPath = useMemo(() => {
    return teamOwnerId ? `users/${teamOwnerId}/teamMembers` : null;
  }, [teamOwnerId]);

  const teamMembersCollectionRef = useMemoFirebase(() => {
      return teamMembersCollectionPath ? collection(firestore, teamMembersCollectionPath) : null;
  }, [teamMembersCollectionPath, firestore]);

  const { data: teamMembersData, loading: membersLoading } = useCollection<TeamMember>(teamMembersCollectionRef);

  const teamMembers = useMemo(() => {
    if (!teamMembersData && !ownerProfile) return [];
    
    // Start with the members from the subcollection.
    const allMembers = teamMembersData ? [...teamMembersData] : [];

    // If the user is a team member, their owner should be available to chat with.
    if (ownerProfile) {
      // Check if the owner is already in the list to avoid duplicates.
      const ownerInList = allMembers.some(m => m.uid === ownerProfile.uid);
      if (!ownerInList) {
        allMembers.push({
          id: ownerProfile.uid,
          uid: ownerProfile.uid,
          name: ownerProfile.name,
          email: ownerProfile.email,
          role: `${ownerProfile.role} (Jefe)`,
          avatarUrl: ownerProfile.avatarUrl,
          phone: ownerProfile.phone,
          authType: 'email', // Assuming email, adjust if necessary
        });
      }
    }
    return allMembers;
  }, [teamMembersData, ownerProfile]);
  
  useEffect(() => {
    if (!rawConversations || !firestore) {
      setProcessedConversations([]);
      return;
    }

    let isMounted = true;

    fetchAndEnrichConversations(rawConversations, firestore).then(
      (enriched) => {
        if (isMounted) {
          setProcessedConversations(enriched);
        }
      }
    );

    return () => {
      isMounted = false;
    };
  }, [rawConversations, firestore]);

  
  const unreadCount = useMemo(() => {
    return (processedConversations || []).filter(c => 
      c.lastMessage && 
      user && c.lastMessage.senderId !== user.uid &&
      !c.lastMessage.readBy?.includes(user.uid)
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
  
  const sendMessage = async (chatId: string, message: Partial<Message>, file?: File) => {
    if (!firestore || !user) return;
    
    let mediaUrl: string | undefined = undefined;
    let mediaType: string | undefined = undefined;
    let mediaName: string | undefined = undefined;

    if (file) {
      const storage = getStorage();
      const filePath = `chat_media/${chatId}/${Date.now()}_${file.name}`;
      const fileRef = storageRef(storage, filePath);
      
      try {
        const snapshot = await uploadBytes(fileRef, file);
        mediaUrl = await getDownloadURL(snapshot.ref);
        
        if (file.type.startsWith('image/')) mediaType = 'image';
        else if (file.type.startsWith('video/')) mediaType = 'video';
        else if (file.type.startsWith('audio/')) mediaType = 'audio';
        else mediaType = 'file';

        mediaName = file.name;

      } catch (error) {
        console.error("Error al subir archivo:", error);
        return;
      }
    }

    const messagesCollectionRef = collection(firestore, `chats/${chatId}/messages`);
    const chatDocRef = doc(firestore, `chats/${chatId}`);
    const timestamp = serverTimestamp();

    const newMessage: Omit<Message, 'id'> = {
      ...message,
      senderId: user.uid,
      timestamp: timestamp,
      readBy: [user.uid],
      ...(mediaUrl && { mediaUrl, mediaType, mediaName }),
    };

    addDoc(messagesCollectionRef, newMessage).catch(async (serverError) => {
      const permissionError = new FirestorePermissionError({
        path: messagesCollectionRef.path,
        operation: 'create',
        requestResourceData: newMessage,
      });
      errorEmitter.emit('permission-error', permissionError);
    });

    let lastMessageText = message.text;
    if (mediaType === 'image') lastMessageText = '📷 Imagen';
    else if (mediaType === 'video') lastMessageText = '📹 Video';
    else if (mediaType === 'audio') lastMessageText = '🎵 Audio';
    else if (mediaType === 'file') lastMessageText = `📄 ${mediaName}`;


    updateDoc(chatDocRef, {
      lastMessage: {
        text: lastMessageText,
        senderId: user.uid,
        readBy: [user.uid],
        mediaType: mediaType || null,
      },
      lastMessageTimestamp: timestamp,
    });
  };
  
 const getOrCreateConversation = async (memberId: string): Promise<string | null> => {
    if (!firestore || !user) return null;

    const looksLikeUid = (s: any) => typeof s === 'string' && s.length >= 20 && !s.includes('/');
    if (!looksLikeUid(memberId)) {
        console.error(`[ChatContext] Se intentó crear una conversación con un ID inválido: ${memberId}`);
        return null;
    }

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
    loading: chatsLoading || membersLoading,
    getMessagesForConversation,
    sendMessage,
    getOrCreateConversation,
    unreadCount,
  }), [processedConversations, teamMembers, chatsLoading, membersLoading, unreadCount, getMessagesForConversation, sendMessage, getOrCreateConversation ]);

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
