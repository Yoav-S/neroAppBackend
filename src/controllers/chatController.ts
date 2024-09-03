import { Request, Response, NextFunction } from 'express';
import Chat from '../models/Chat';
import Message from '../models/Message';
import { createAppError, ErrorCode } from '../utils/errors';
import User from '../models/User';
import { bucket } from '../config/firebaseConfig';
import mongoose from 'mongoose';
import { getDatabase } from '../config/database';

// Create a new chat



// Fetch all chats for a user
export const getUserChats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, page = 0 } = req.body;
    const limit = 7;
    const skip = page * limit;

    // Connect to the database
    const db = getDatabase();
    const chatsCollection = db.collection('chats');
    const usersCollection = db.collection('users');
    const messagesCollection = db.collection('messages');

    // Fetch chats where the user is a participant
    const chats = await chatsCollection
      .find({ participants: userId })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Prepare an array to store the result with other user details
    const resultChats = await Promise.all(
      chats.map(async (chat) => {
        // Determine the other participant's ID (assuming only 2 participants)
        const otherParticipantId = chat.participants.find((id: string) => id !== userId);

        // Fetch the other user's profile information
        const otherUser = await usersCollection.findOne(
          { _id: otherParticipantId },
          { projection: { picture: 1, firstName: 1, lastName: 1 } }
        );

        // Fetch the last message details
        const lastMessage = chat.lastMessage
          ? await messagesCollection.findOne(
              { _id: chat.lastMessage },
              { projection: { content: 1, createdAt: 1 } }
            )
          : null;

        // Map to the ChatListProps format
        return {
          chatId: chat.chatId,
          profilePicture: otherUser ? otherUser.picture : '',
          fullName: otherUser ? `${otherUser.firstName} ${otherUser.lastName}` : '',
          lastMessageText: lastMessage ? lastMessage.content : '',
          lastMessageDate: lastMessage ? lastMessage.createdAt : new Date(),
          isPinned: false, // Assume false unless you have pinning functionality
          messagesDidntReadAmount: chat.messagesDidntReadAmount || 0, // Assuming you have a field for this
        };
      })
    );

    // Send the response with the chats and pagination info
    res.status(200).json({
      success: true,
      data: resultChats,
      pagination: {
        isMore: (page + 1) * limit < chats.length,
        page,
        totalPages: Math.ceil(chats.length / limit),
        totalChats: chats.length
      }
    });
  } catch (error) {
    next(error);
  }
};


//