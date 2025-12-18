'use client';

import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import type { Chat, Message, UserProfile } from '@/lib/types';
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
  getMessagesForConversation: (chatId: string) => { messages: Message[], loading: boolean };
  sendMessage: (chatId: string, message: Partial<Message>) => void;
  createConversation: (memberId: string) => Promise<string | null>;
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

  const { data: rawConversations, loading } = useCollection<Chat>(chatsQuery);

  // Separate memo to process data, preventing re-fetches on downstream changes
  const conversations = useMemo(() => {
      if (!rawConversations || !firestore || !user) return [];
      
      const processedConversations = Promise.all(rawConversations.map(async (convo) => {
          const newMembers: { [key: string]: Pick<UserProfile, 'name' | 'avatarUrl'> } = {};
          let shouldUpdate = false;

          for (const memberId of convo.memberIds) {
              // If member data is missing or placeholder, fetch it
              if (!convo.members?.[memberId] || convo.members[memberId].name === 'Fetching...') {
                  try {
                      const userDocRef = doc(firestore, 'users', memberId);
                      const userDocSnap = await getDoc(userDocRef);
                      if (userDocSnap.exists()) {
                          const userData = userDocSnap.data() as UserProfile;
                          newMembers[memberId] = { name: userData.name, avatarUrl: userData.avatarUrl };
                          shouldUpdate = true;
                      } else {
                          // Keep existing data if any, or a default
                          newMembers[memberId] = convo.members?.[memberId] || { name: 'Usuario Desconocido', avatarUrl: '' };
                      }
                  } catch (error) {
                      console.error(`Failed to fetch profile for member ${memberId}:`, error);
                      newMembers[memberId] = convo.members?.[memberId] || { name: 'Error al Cargar', avatarUrl: '' };
                  }
              } else {
                  // Keep existing, valid data
                  newMembers[memberId] = convo.members[memberId];
              }
          }

          if (shouldUpdate) {
              const chatDocRef = doc(firestore, 'chats', convo.id);
              // Non-blocking update
              updateDoc(chatDocRef, { members: newMembers });
          }

          return { ...convo, members: newMembers };
      }));

      // For optimistic UI, we can show the raw data while profiles are fetched
      // This part is complex to make fully synchronous without another state
      // For now, we rely on the next snapshot update after `updateDoc`
      return rawConversations;

  }, [rawConversations, firestore, user]);

  
  const unreadCount = useMemo(() => {
    // This is a simplified unread count.
    // A more robust solution would involve a separate "unread" collection or aggregation.
    return (conversations || []).filter(c => 
      c.lastMessage && 
      c.lastMessage.senderId !== user?.uid
      // A proper implementation would check if the current user is in `readBy` array of lastMessage
    ).length;
  }, [conversations, user]);


  const getMessagesForConversation = (chatId: string) => {
    const messagesCollectionRef = useMemoFirebase(() => {
      if (!firestore) return null;
      return collection(firestore, `chats/${chatId}/messages`);
    }, [firestore, chatId]);

    const messagesQuery = useMemoFirebase(() => {
      if (!messagesCollectionRef) return null;
      return query(messagesCollectionRef, orderBy('timestamp', 'asc'));
    }, [messagesCollectionRef]);
    
    const { data: messages, loading } = useCollection<Message>(messagesQuery);
    
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

    // Update the last message on the chat document for sorting and previews
    updateDoc(chatDocRef, {
      lastMessage: {
        text: message.text,
        senderId: user.uid,
      },
      lastMessageTimestamp: timestamp,
    });
  };
  
  const createConversation = async (memberId: string): Promise<string | null> => {
    if (!firestore || !user) return null;
    const chatsCollectionRef = collection(firestore, 'chats');

    // Sort IDs to ensure the query is always the same for the same two users
    const memberIds = [user.uid, memberId].sort();
    
    // Check if a chat already exists
    const existingChatQuery = query(
      chatsCollectionRef,
      where('memberIds', '==', memberIds)
    );

    try {
      const existingChatSnap = await getDocs(existingChatQuery);
      if (!existingChatSnap.empty) {
        return existingChatSnap.docs[0].id;
      }

      // Fetch user profiles to store in the chat document
      const userDocRef = doc(firestore, 'users', user.uid);
      const memberDocRef = doc(firestore, 'users', memberId);

      const [userDocSnap, memberDocSnap] = await Promise.all([getDoc(userDocRef), getDoc(memberDocRef)]);

      const userProfile = userDocSnap.exists() ? userDocSnap.data() as UserProfile : null;
      const memberProfile = memberDocSnap.exists() ? memberDocSnap.data() as UserProfile : null;

      // Create a new chat
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
    loading,
    getMessagesForConversation,
    sendMessage,
    createConversation,
    unreadCount,
  }), [conversations, loading, unreadCount]);

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
