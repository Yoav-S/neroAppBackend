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
              { $sort: { 'messages.timestamp': -1 } }, // Sort messages from newest to oldest
              { $limit: 20 }, // Limit the number of messages to 20
              {
                $lookup: {
                  from: 'users',
                  localField: 'messages.sender',
                  foreignField: '_id',
                  as: 'senderInfo',
                },
              },
              {
                $project: {
                  messageId: '$messages.messageId',
                  sender: { $arrayElemAt: ['$senderInfo._id', 0] },
                  messageText: '$messages.content',
                  formattedTime: { $dateToString: { format: '%H:%M', date: '$messages.timestamp' } },
                  status: '$messages.status',
                  image: '$messages.imageUrl',
                  timestamp: '$messages.timestamp',
                  isLastMessageIsImage: {
                    $cond: [{ $ne: ['$messages.imageUrl', null] }, true, false], // Check if imageUrl is not null
                  },
                },
              },
            ];
    
            const recentMessages = await messagesCollection.aggregate(pipeline).toArray();
    
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
              isLastMessageIsImage: lastMessage?.isLastMessageIsImage || false, // Add the new property
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
    
        console.log('formData:', formData);
    
        // Extract data from formData
        formData._parts.forEach(([key, value]: [string, any]) => {
          if (key === 'messageText') {
            messageText = value;
          } else if (key === 'sender') {
            sender = value;
          } else if (key === 'chatId') {
            chatId = value;
          } else if (key === 'imagesUrl') {
            images.push(value); // Base64 data is here
          }
        });
    
        if (!chatId || !sender) {
          throw new Error('Chat ID and Sender are required');
        }
    
        let newMessages: any[] = [];
        console.log(messageText, sender, chatId, images);
    
        // Handle text-only messages (no images provided)
        if (messageText && images.length === 0) {
          const textMessage = {
            messageId: new mongoose.Types.ObjectId(),
            sender: mongoose.Types.ObjectId.createFromHexString(sender),
            content: messageText,
            imageUrl: '', // No image
            timestamp: new Date(),
            status: 'Delivered',
            isEdited: false,
            reactions: [],
            attachments: [],
          };
          newMessages.push(textMessage);
        }
    
        // Process image files if they exist
        for (const [index, image] of images.entries()) {
          console.log('image', image);
    
          // Create a unique filename for each image
          const uniqueFilename = `Chats/${chatId}/${image.name}`;
          const file = bucket.file(uniqueFilename);
          console.log('file', file);
    
          try {
            // Decode the base64 string to a buffer
            const base64Data = image.base64;
            const fileBuffer = Buffer.from(base64Data, 'base64');
            console.log('fileBuffer', fileBuffer);
    
            // Upload image to Firebase Storage bucket
            await file.save(fileBuffer, {
              metadata: {
                contentType: image.type,
              },
              public: true,
            });
    
            const imageUrl = `https://storage.googleapis.com/${bucket.name}/${uniqueFilename}`;
    
            // Construct the message object with or without text
            const imageMessage = {
              messageId: new mongoose.Types.ObjectId(),
              sender: mongoose.Types.ObjectId.createFromHexString(sender),
              content: index === 0 ? messageText || '' : '', // Add text only with the first image
              imageUrl,
              timestamp: new Date(),
              status: 'Delivered',
              isEdited: false,
              reactions: [],
              attachments: [],
            };
            console.log('imageMessage', imageMessage);
    
            newMessages.push(imageMessage);
          } catch (error) {
            console.error('Error processing image:', error);
          }
        }
    
        // If no messages were created, throw an error
        if (newMessages.length === 0) {
          throw new Error('No valid messages to send');
        }
    
        // Save the messages in the chat
        const result = await messagesCollection.updateOne(
          { chatId: mongoose.Types.ObjectId.createFromHexString(chatId) },
          {
            $push: { messages: { $each: newMessages } } as any,
          }
        );
    
        if (result.modifiedCount === 0) {
          throw new Error('Failed to send message');
        }
    
        // Broadcast the message to the chat room
        io.to(chatId).emit('newMessage', newMessages);
    
        // Acknowledge the sender
        socket.emit('messageSent', { success: true, messages: newMessages });
    
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
