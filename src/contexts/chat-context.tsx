
'use client';

import React, { createContext, useContext, ReactNode, useMemo } from 'react';
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

  const conversations = useMemo(() => {
      if (!rawConversations || !firestore || !user) return [];
      
      const processedConversations = Promise.all(rawConversations.map(async (convo) => {
          const newMembers: { [key: string]: Pick<UserProfile, 'name' | 'avatarUrl'> } = {};
          let shouldUpdate = false;

          for (const memberId of convo.memberIds) {
              if (!convo.members?.[memberId] || convo.members[memberId].name === 'Fetching...') {
                  try {
                      const userDocRef = doc(firestore, 'users', memberId);
                      const userDocSnap = await getDoc(userDocRef);
                      if (userDocSnap.exists()) {
                          const userData = userDocSnap.data() as UserProfile;
                          newMembers[memberId] = { name: userData.name, avatarUrl: userData.avatarUrl };
                          shouldUpdate = true;
                      } else {
                          newMembers[memberId] = convo.members?.[memberId] || { name: 'Usuario Desconocido', avatarUrl: '' };
                      }
                  } catch (error) {
                      console.error(`Failed to fetch profile for member ${memberId}:`, error);
                      newMembers[memberId] = convo.members?.[memberId] || { name: 'Error al Cargar', avatarUrl: '' };
                  }
              } else {
                  newMembers[memberId] = convo.members[memberId];
              }
          }

          if (shouldUpdate) {
              const chatDocRef = doc(firestore, 'chats', convo.id);
              updateDoc(chatDocRef, { members: newMembers });
          }

          return { ...convo, members: newMembers };
      }));
      
      return rawConversations;

  }, [rawConversations, firestore, user]);

  
  const unreadCount = useMemo(() => {
    return (conversations || []).filter(c => 
      c.lastMessage && 
      c.lastMessage.senderId !== user?.uid &&
      !c.lastMessage.readBy?.includes(user.uid)
    ).length;
  }, [conversations, user]);


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
    
    // Mark messages as read
    if (messages && messages.length > 0 && user && chatId) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.senderId !== user.uid && !lastMessage.readBy.includes(user.uid)) {
            const chatDocRef = doc(firestore, 'chats', chatId);
            updateDoc(chatDocRef, {
                'lastMessage.readBy': [...(lastMessage.readBy || []), user.uid]
            });
        }
    }
    
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

      const newChatDoc = await addDoc(chatsCollectionRef, {
        memberIds: memberIds, 
        members: {
          [user.uid]: { name: userProfile?.name || 'Usuario', avatarUrl: userProfile?.avatarUrl || '' },
          [memberId]: { name: memberProfile?.name || 'Usuario', avatarUrl: memberProfile?.avatarUrl || '' }
        },
        lastMessage: null,
        lastMessageTimestamp: serverTimestamp(),
      });
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
    conversations: conversations || [],
    teamMembers: teamMembers || [],
    loading: chatsLoading || membersLoading,
    getMessagesForConversation,
    sendMessage,
    getOrCreateConversation,
    unreadCount,
  }), [conversations, teamMembers, chatsLoading, membersLoading, unreadCount]);

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
