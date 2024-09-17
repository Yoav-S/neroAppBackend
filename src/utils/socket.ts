import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';
import { Request, Response, NextFunction } from 'express';
import { Server as HTTPServer } from 'http';
import mongoose from 'mongoose';
import { formatLastMessageDate } from '../controllers/chatController';
import { getDatabase } from '../config/database';

// Extend the Express Request type to include the io object
declare module 'express-serve-static-core' {
  interface Request {
    io?: SocketIOServer;
  }
}

let io: SocketIOServer | null = null;

export const socketMiddleware = (httpServer: HTTPServer) => {
  // Initialize Socket.IO and attach to the HTTP server
  io = new SocketIOServer(httpServer);

// In your backend socket config
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('getChatsPagination', async ({ userId, pageNumber }) => {
    try {
      const limit = 7;
      const skip = pageNumber * limit;

      // Convert userId to ObjectId
      const userObjectId = mongoose.Types.ObjectId.createFromHexString(userId);

      // Connect to the database
      const db = getDatabase();
      const chatsCollection = db.collection('Chats');
      const usersCollection = db.collection('users');
      const messagesCollection = db.collection('Messages');

      console.log(`Fetching chats for user: ${userId}, Page: ${pageNumber}, Limit: ${limit}`);

      // Fetch chats where the user is a participant
      const chats = await chatsCollection
        .find({ participants: { $in: [userObjectId] } })
        .skip(skip)
        .limit(limit)
        .toArray();

      console.log(`Fetched chats: ${chats.length} chats found`);

      if (!chats || chats.length === 0) {
        return socket.emit('chatsPaginationResponse', {
          success: true,
          data: [],
          pagination: {
            isMore: false,
            page: pageNumber,
            totalPages: 0,
            totalChats: 0,
          },
        });
      }

      // Map chat details
      const resultChats = await Promise.all(
        chats.map(async (chat) => {
          const otherParticipantIds = chat.participants.filter(
            (id: mongoose.Types.ObjectId) => id.toString() !== userObjectId.toString()
          );

          const otherUser = await usersCollection.findOne(
            { _id: { $in: otherParticipantIds } },
            { projection: { picture: 1, firstName: 1, lastName: 1 } }
          );

          const allMessages = await messagesCollection.findOne(
            { chatId: chat._id },
            { projection: { messages: 1 } }
          );

          let unreadMessagesCount = 0;
          let recentMessages = [];

          if (allMessages?.messages) {
            recentMessages = allMessages.messages.slice(-20).reverse();

            for (const message of recentMessages) {
              if (
                message.sender.toString() !== userObjectId.toString() &&
                message.status !== 'Read'
              ) {
                unreadMessagesCount++;
              } else {
                break;
              }
            }

            recentMessages = recentMessages.reverse();
          }

          const lastMessage = recentMessages[recentMessages.length - 1];

          return {
            chatId: chat.chatId,
            profilePicture: otherUser?.picture || '',
            fullName: otherUser
              ? `${otherUser.firstName} ${otherUser.lastName}`
              : '',
            lastMessageText: lastMessage?.content || '',
            lastMessageDate: lastMessage?.timestamp
              ? formatLastMessageDate(new Date(lastMessage.timestamp))
              : '',
            isLastMessageSenderIsTheUser:
              lastMessage?.sender.toString() === userObjectId.toString(),
            lastMessageStatus: lastMessage?.status || '',
            recieverId: otherParticipantIds.toString(),
            isPinned: false, // Modify if pinning feature is present
            messagesDidntReadAmount: unreadMessagesCount,
            recentMessages: recentMessages,
          };
        })
      );

      console.log('Resulted chats', resultChats);

      // Emit the response to the socket
      socket.emit('chatsPaginationResponse', {
        success: true,
        data: resultChats,
        pagination: {
          isMore: resultChats.length === limit,
          page: pageNumber,
          totalPages: Math.ceil(chats.length / limit),
          totalChats: chats.length,
        },
      });
    } catch (error) {
      console.error('Error in getChatsPagination:', error);
      socket.emit('chatsPaginationResponse', { success: false });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});


  // Middleware to attach the io object to the request
  return (req: Request, res: Response, next: NextFunction) => {
    if (io) {
      req.io = io;
    }
    next();
  };
};
