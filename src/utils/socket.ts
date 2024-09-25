import { Server, Socket } from 'socket.io';
import mongoose from 'mongoose';
import { getDatabase } from '../config/database';
import { formatLastMessageDate } from '../controllers/chatController';

import { CustomFile } from './interfaces';
import { bucket } from '../config/firebaseConfig';
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
    
            // Use a pipeline to fetch and format the recent messages
            const pipeline = [
              { $match: { chatId: chat._id } },
              { $unwind: '$messages' },
              { $sort: { 'messages.timestamp': -1 } },  // Sort messages from newest to oldest
              { $limit: 20 },  // Limit the number of messages to 20
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
    
            const recentMessages = await messagesCollection.aggregate(pipeline).toArray();
            
            // Reverse the order to match the getChatMessages direction
    
            let unreadMessagesCount = 0;
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
    
            const lastMessage = recentMessages[0];
    
            return {
              chatId: chat.chatId,
              profilePicture: otherUser?.picture || '',
              fullName: otherUser ? `${otherUser.firstName} ${otherUser.lastName}` : '',
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
              recentMessages, // Send the formatted messages to frontend
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

    socket.on('sendMessage', async (formData) => {
      try {
        const db = getDatabase();
        const messagesCollection = db.collection('Messages');
    
        let messageText = '';
        let sender = '';
        let chatId = '';
        let images: any[] = [];
    
        // Extract data from formData
        formData._parts.forEach(([key, value]: [string, any]) => {
          if (key === 'messageText') {
            messageText = value;
          } else if (key === 'sender') {
            sender = value;
          } else if (key === 'chatId') {
            chatId = value;
          } else if (key === 'imagesUrl') {
            images.push(value); // Capture image objects
          }
        });
    
        console.log('Received data:', { messageText, sender, chatId, images });
    
        // Check if the chat exists
        const existingMessage = await messagesCollection.findOne({ chatId: mongoose.Types.ObjectId.createFromHexString(chatId) });
        if (!existingMessage) {
          return socket.emit('error', { message: 'Chat not found' });
        }
    
        const newMessages: any[] = [];
    
        // Handle the first image with text (if any)
        if (messageText && images.length > 0) {
          const firstImage = images[0];
    
          // Upload the first image to Firebase Storage
          const uniqueFilename = `Chats/${chatId}/${firstImage.originalname}`;
          const file = bucket.file(uniqueFilename);
          await file.save(firstImage.buffer, {
            metadata: {
              contentType: firstImage.mimetype,
            },
            public: true,
          });
    
          const firstImageUrl = `https://storage.googleapis.com/${bucket.name}/${uniqueFilename}`;
    
          // Create the message with text and the first image
          const firstMessage = {
            messageId: new mongoose.Types.ObjectId(),
            sender: mongoose.Types.ObjectId.createFromHexString(sender),
            content: messageText, // Text content with the first image
            imageUrl: firstImageUrl,
            timestamp: new Date(),
            status: 'Delivered',
            isEdited: false,
            reactions: [],
            attachments: [],
          };
          newMessages.push(firstMessage);
    
          // Remove the first image from the list, so it won't be processed again
          images.shift();
        }
    
        // Handle remaining images without text
        for (const image of images) {
          const uniqueFilename = `Chats/${chatId}/${image.originalname}`;
          const file = bucket.file(uniqueFilename);
          await file.save(image.buffer, {
            metadata: {
              contentType: image.mimetype,
            },
            public: true,
          });
    
          const imageUrl = `https://storage.googleapis.com/${bucket.name}/${uniqueFilename}`;
    
          // Create message for each image without text content
          const imageMessage = {
            messageId: new mongoose.Types.ObjectId(),
            sender: mongoose.Types.ObjectId.createFromHexString(sender),
            content: '', // No text content
            imageUrl: imageUrl,
            timestamp: new Date(),
            status: 'Delivered',
            isEdited: false,
            reactions: [],
            attachments: [],
          };
          newMessages.push(imageMessage);
        }
    
        // Save the messages in the chat
        const result = await messagesCollection.updateOne(
          { chatId: mongoose.Types.ObjectId.createFromHexString(chatId) },
          { $push: { messages: { $each: newMessages } } as any }
        );
    
        if (result.modifiedCount === 0) {
          throw new Error('Failed to send message');
        }
    
        // Emit success to client
        const formattedMessages = newMessages.map((msg) => ({
          formattedTime: msg.timestamp,
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
