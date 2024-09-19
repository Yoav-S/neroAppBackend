import { Server, Socket } from 'socket.io';
import mongoose from 'mongoose';
import { getDatabase } from '../config/database';
import { formatLastMessageDate } from '../controllers/chatController';
import { uploadImage } from '../controllers/chatController';
import { MessageType } from './interfaces';
export const socketHandler = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    socket.on('joinRoom', (chatId: string) => {
      socket.join(chatId);  // Joins the chat room with the chatId
    });
    

    // Handle fetching chat messages
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
    
        // Fetch chats where the user is a participant
        const chats = await chatsCollection
          .find({ participants: { $in: [userObjectId] } })
          .skip(skip)
          .limit(limit)
          .toArray();
    
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
              (id: Object) => id.toString() !== userObjectId.toString()
            );
    
            // Fetch the other user info
            const otherUser = await usersCollection.findOne(
              { _id: { $in: otherParticipantIds } },
              { projection: { picture: 1, firstName: 1, lastName: 1 } }
            );
    
            // Fetch messages for the current chat
            const allMessages = await messagesCollection.findOne(
              { chatId: chat._id },
              { projection: { messages: 1 } }
            );
    
            let unreadMessagesCount = 0;
            let recentMessages = [];
    
            if (allMessages?.messages) {
              // Slice and reverse the last 20 messages
              recentMessages = allMessages.messages.slice(-20).reverse();
    
              // Calculate unread messages count
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
    
              // Reverse back to the original order
              recentMessages = recentMessages.reverse();
    
              // Map messages to the expected format
              recentMessages = recentMessages.map((message: any) => ({
                messageId: message.messageId,
                sender: message.sender,
                messageText: message.messageText,
                formattedTime: message.formattedTime,
                status: message.status,
                image: message.image,
                timestamp: message.timestamp,
              }));
            }
    
            const lastMessage = recentMessages[recentMessages.length - 1];
    
            return {
              chatId: chat.chatId,
              profilePicture: otherUser?.picture || '',
              fullName: otherUser
                ? `${otherUser.firstName} ${otherUser.lastName}`
                : '',
              lastMessageText: lastMessage?.messageText || '',
              lastMessageDate: lastMessage?.timestamp
                ? formatLastMessageDate(new Date(lastMessage.timestamp))
                : '',
              isLastMessageSenderIsTheUser:
                lastMessage?.sender.toString() === userObjectId.toString(),
              lastMessageStatus: lastMessage?.status || '',
              recieverId: otherParticipantIds.toString(),
              isPinned: false,
              messagesDidntReadAmount: unreadMessagesCount,
              recentMessages: recentMessages, // Send the formatted messages to frontend
            };
          })
        );
    
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
    



    // Handle sending a message
    socket.on('getChatMessages', async ({ chatId, pageNumber }: { chatId: string; pageNumber: number }) => {
      try {
        const pageSize = 20;
        const page = Math.max(1, Math.floor(Number(pageNumber) || 1));
        const skip = (page - 1) * pageSize;

        const db = getDatabase();
        const messagesCollection = db.collection('Messages');

        const pipeline = [
          { $match: { chatId: mongoose.Types.ObjectId.createFromHexString(chatId) } },
          { $project: { messages: { $slice: [{ $reverseArray: '$messages' }, skip, pageSize] } } },
          { $unwind: '$messages' },
          { $lookup: { from: 'users', localField: 'messages.sender', foreignField: '_id', as: 'senderInfo' } },
          {
            $project: {
              messageId: '$messages.messageId',
              sender: { $arrayElemAt: ['$senderInfo._id', 0] },
              messageText: '$messages.content',
              formattedTime: { $dateToString: { format: '%H:%M', date: '$messages.timestamp' } },
              status: '$messages.status',
              image: '$messages.imageUrl',
              timestamp: '$messages.timestamp',
            },
          },
        ];

        const chatMessages = await messagesCollection.aggregate(pipeline).toArray();

        const totalMessagesResult = await messagesCollection.aggregate([
          { $match: { chatId: mongoose.Types.ObjectId.createFromHexString(chatId) } },
          { $project: { messageCount: { $size: '$messages' } } },
        ]).toArray();

        const totalItems = totalMessagesResult[0]?.messageCount || 0;
        const totalPages = Math.ceil(totalItems / pageSize);

        const formattedChatMessages = chatMessages.map((message) => ({
          messageId: message.messageId,
          sender: message.sender,
          messageText: message.messageText,
          formattedTime: message.formattedTime,
          status: message.status,
          image: message.image,
          timestamp: message.timestamp,
        }));

        const response = {
          success: true,
          data: formattedChatMessages,
          pagination: {
            isMore: page < totalPages,
            page: page,
            totalPages: totalPages,
            totalItems: totalItems,
          },
        };

        socket.emit('chatMessagesResponse', response);
      } catch (error) {
        console.error('Error in getChatMessages:', error);
        socket.emit('error', { message: 'Server error' });
      }
    });

    // Handle sending a message
    socket.on('sendMessage', async ({ chatId, sender, messageText, images }: any) => {
      try {
        const db = getDatabase();
        const messagesCollection = db.collection('Messages');

        const existingMessage = await messagesCollection.findOne({ chatId: mongoose.Types.ObjectId.createFromHexString(chatId) });
        if (!existingMessage) {
          return socket.emit('error', { message: 'Chat not found' });
        }

        const newMessages: any[] = [];

        const firstMessage = {
          messageId: new mongoose.Types.ObjectId(),
          sender: mongoose.Types.ObjectId.createFromHexString(sender),
          content: messageText,
          imageUrl: images.length > 0 ? await uploadImage(chatId, images[0]) : undefined,
          timestamp: new Date(),
          status: 'Delivered',
          isEdited: false,
          reactions: [],
          attachments: [],
        };

        newMessages.push(firstMessage);

        for (let i = 1; i < images.length; i++) {
          const imageMessage = {
            messageId: new mongoose.Types.ObjectId(),
            sender: mongoose.Types.ObjectId.createFromHexString(sender),
            content: '',
            imageUrl: await uploadImage(chatId, images[i]),
            timestamp: new Date(),
            status: 'Delivered',
            isEdited: false,
            reactions: [],
            attachments: [],
          };
          newMessages.push(imageMessage);
        }

        const result = await messagesCollection.updateOne(
          { chatId: mongoose.Types.ObjectId.createFromHexString(chatId) },
          { push: { messages: { $each: newMessages } } }
        );

        if (result.modifiedCount === 0) {
          throw new Error('Failed to send message');
        }

        const formattedMessages = newMessages.map((msg) => ({
          formattedTime: formatLastMessageDate(msg.timestamp),
          messageId: msg.messageId.toString(),
          sender: msg.sender.toString(),
          messageText: msg.content,
          image: msg.imageUrl,
          status: msg.status,
        }));

        io.to(chatId).emit('newMessage', formattedMessages);

        socket.emit('messageSent', { success: true, messages: formattedMessages });
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Error sending message' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};
