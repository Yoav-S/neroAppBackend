import { Server, Socket } from 'socket.io';
import mongoose from 'mongoose';
import { getDatabase } from '../config/database';
import { formatLastMessageDate, formatTime } from '../controllers/chatController';
import { bucket } from '../config/firebaseConfig';
export const socketHandler = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    socket.on('joinRoom', (chatId: string) => {
      socket.join(chatId);  // Joins the chat room with the chatId
    });

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
    
            // Fetch the other user's info
            const otherUser = await usersCollection.findOne(
              { _id: { $in: otherParticipantIds } },
              { projection: { picture: 1, firstName: 1, lastName: 1 } }
            );
    
            // Extract the last message from the messages array inside the chat document
            const lastMessage = chat.messages ? chat.messages[chat.messages.length - 1] : null;
    
            let unreadMessagesCount = 0;
            if (chat.messages) {
              for (const message of chat.messages.reverse()) {
                if (
                  message.senderId.toString() !== userObjectId.toString() &&
                  message.status !== 'Read'
                ) {
                  unreadMessagesCount++;
                } else {
                  break;
                }
              }
            }
    
            return {
              chatId: chat.chatId,
              profilePicture: otherUser?.picture || '',
              fullName: otherUser ? `${otherUser.firstName} ${otherUser.lastName}` : '',
              lastMessageText: lastMessage?.content || '',
              lastMessageDate: lastMessage?.timestamp
                ? formatLastMessageDate(new Date(lastMessage.timestamp)) // Using the provided helper function
                : '',
              isLastMessageSenderIsTheUser:
                lastMessage?.senderId.toString() === userObjectId.toString(),
              lastMessageStatus: lastMessage?.status || '',
              isLastMessageIsImage: lastMessage?.imageUrl ? true : false,
              recieverId: otherParticipantIds.toString(),
              isPinned: false,
              messagesDidntReadAmount: unreadMessagesCount,
              
              // Map recentMessages with correct structure
              recentMessages: chat.messages
                ? chat.messages.slice(-20).map((message: any) => ({
                    messageId: message.messageId,
                    sender: message.senderId, // Use senderId from message
                    messageText: message.content,
                    formattedTime: formatTime(new Date(message.timestamp)), // Using the formatTime helper function
                    status: message.status,
                    image: message.imageUrl || '', // Provide default empty string if no image
                    timestamp: message.timestamp,
                    isEdited: message.isEdited || false, // Default to false if not provided
                  }))
                : [],
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
        socket.emit('chatsPaginationResponse', { success: false });
      }
    });
    
    
    
    socket.on('getChatMessages', async ({ chatId, pageNumber }: { chatId: string; pageNumber: number }) => {
      try {
        const pageSize = 20;
        const page = Math.max(1, Math.floor(Number(pageNumber) || 1));
        const skip = (page - 1) * pageSize;
    
        const db = getDatabase();
        const chatsCollection = db.collection('Chats'); // Use Chats collection
    
        console.log(`Fetching chat messages for chatId: ${chatId}, page: ${page}, skip: ${skip}`); // Log chatId, page, and skip value
    
        // Updated pipeline to retrieve from the messages array inside Chats
        const pipeline = [
          { $match: { _id: mongoose.Types.ObjectId.createFromHexString(chatId) } }, // Match the chat by chatId
          { $project: { messages: { $slice: [{ $reverseArray: '$messages' }, skip, pageSize] } } }, // Reverse messages and paginate
          { $unwind: '$messages' }, // Unwind the messages array to access individual messages
          { $lookup: { from: 'users', localField: 'messages.sender', foreignField: '_id', as: 'senderInfo' } }, // Lookup sender info
          {
            $project: {
              messageId: '$messages.messageId',
              sender: { $arrayElemAt: ['$senderInfo._id', 0] },
              messageText: '$messages.content',
              formattedTime: { $dateToString: { format: '%H:%M', date: '$messages.timestamp' } },
              status: '$messages.status',
              image: '$messages.imageUrl',
              timestamp: '$messages.timestamp',
              isEdited: '$messages.isEdited', // Added the isEdited field
            },
          },
        ];
    
        console.log('Running pipeline:', JSON.stringify(pipeline, null, 2)); // Log the aggregation pipeline
    
        const chatMessages = await chatsCollection.aggregate(pipeline).toArray();
    
        console.log(`Retrieved ${chatMessages.length} messages`); // Log the number of messages retrieved
    
        // Calculate total number of messages
        const totalMessagesResult = await chatsCollection.aggregate([
          { $match: { _id: mongoose.Types.ObjectId.createFromHexString(chatId) } },
          { $project: { messageCount: { $size: '$messages' } } },
        ]).toArray();
    
        const totalItems = totalMessagesResult[0]?.messageCount || 0;
        const totalPages = Math.ceil(totalItems / pageSize);
    
        console.log(`Total messages: ${totalItems}, totalPages: ${totalPages}`); // Log total items and total pages
    
        const formattedChatMessages = chatMessages.map((message) => ({
          messageId: message.messageId,
          sender: message.sender,
          messageText: message.messageText,
          formattedTime: message.formattedTime,
          status: message.status,
          image: message.image,
          timestamp: message.timestamp,
          isEdited: message.isEdited,
        }));
    
        console.log('Formatted messages:', JSON.stringify(formattedChatMessages, null, 2)); // Log formatted messages
    
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
    
        console.log('Sending response:', JSON.stringify(response, null, 2)); // Log the final response
    
        socket.emit('chatMessagesResponse', response);
      } catch (error) {
        console.error('Error fetching chat messages:', error); // Log the error
        socket.emit('error', { message: 'Server error' });
      }
    });
    
    

    socket.on('sendMessage', async (formData) => {
      try {
        const db = getDatabase();
        const chatsCollection = db.collection('Chats'); // Use the Chats collection now
        
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
            images.push(value); // Base64 data is here
          }
        });
    
        if (!chatId || !sender) {
          throw new Error('Chat ID and Sender are required');
        }
    
        let newMessages: any[] = [];
    
        // Handle text-only messages (no images provided)
        if (messageText && images.length === 0) {
          const textMessage = {
            messageId: new mongoose.Types.ObjectId(),
            senderId: mongoose.Types.ObjectId.createFromHexString(sender),
            content: messageText,
            imageUrl: null, // No image
            timestamp: new Date(),
            status: 'Delivered',
            isEdited: false,
          };
          newMessages.push(textMessage);
        }
    
        // Process image files if they exist
        for (const [index, image] of images.entries()) {
          const uniqueFilename = `Chats/${chatId}/${image.name}`;
          const file = bucket.file(uniqueFilename);
    
          try {
            const base64Data = image.base64;
            const fileBuffer = Buffer.from(base64Data, 'base64');
    
            await file.save(fileBuffer, {
              metadata: {
                contentType: image.type,
              },
              public: true,
            });
    
            const imageUrl = `https://storage.googleapis.com/${bucket.name}/${uniqueFilename}`;
    
            const imageMessage = {
              messageId: new mongoose.Types.ObjectId(),
              senderId: mongoose.Types.ObjectId.createFromHexString(sender),
              content: index === 0 ? messageText || '' : '', // Add text only with the first image
              imageUrl,
              timestamp: new Date(),
              status: 'Delivered',
              isEdited: false,
            };
    
            newMessages.push(imageMessage);
          } catch (error) {
          }
        }
    
        // If no messages were created, throw an error
        if (newMessages.length === 0) {
          throw new Error('No valid messages to send');
        }
    
        // Save the messages to the chat's messages array in the Chats collection
        const result = await chatsCollection.updateOne(
          { _id: mongoose.Types.ObjectId.createFromHexString(chatId) }, // Find the chat by chatId
          { $push: { messages: { $each: newMessages } as any } } // Push new messages into the messages array
        );
    
        if (result.modifiedCount === 0) {
          throw new Error('Failed to send message');
        }
    
        // Broadcast the message to the chat room
        io.to(chatId).emit('newMessage', newMessages);
    
        // Acknowledge the sender
        socket.emit('messageSent', { success: true, messages: newMessages });
    
      } catch (error) {
        socket.emit('error', { message: 'Error sending message' });
      }
    });
    
    
    
    socket.on('updateUnreadMessage', async (messageDidntReadAmount: number, chatId: string) => {
      try {
        const db = getDatabase();
        const chatsCollection = db.collection('Chats');
        
        // Fetch the chat and unwind its messages
        const recentMessages = await chatsCollection.aggregate([
          { $match: { _id: mongoose.Types.ObjectId.createFromHexString(chatId) } }, // Find the specific chat
          { $unwind: '$messages' }, // Unwind the messages array
          { $match: { 'messages.status': 'Delivered' } }, // Filter only messages with status 'Delivered'
          { $sort: { 'messages.timestamp': -1 } }, // Sort by timestamp in descending order
          { $limit: messageDidntReadAmount }, // Limit to the number of unread messages
        ]).toArray();
        
        // Extract the messageIds of unread messages
        const messageIdsToUpdate = recentMessages.map((doc) => doc.messages.messageId);
    
        // Update the status of the unread messages from 'Delivered' to 'Read'
        const result = await chatsCollection.updateMany(
          { _id: mongoose.Types.ObjectId.createFromHexString(chatId), 'messages.messageId': { $in: messageIdsToUpdate }, 'messages.status': 'Delivered' },
          { $set: { 'messages.$.status': 'Read' } } // Update the status of each unread message
        );
    
        if (result.modifiedCount > 0) {
          // Emit success response back to the frontend
          socket.emit('messagesUpdated', {
            success: true,
            chatId: chatId,
            updatedCount: result.modifiedCount, // Return the number of messages updated
          });
        } else {
          // Emit failure response if no document was modified
          socket.emit('messagesUpdated', {
            success: false,
            message: 'No messages updated',
          });
        }
      } catch (error: any) {
        socket.emit('error', {
          message: 'Error updating message statuses',
          error: error.message,
        });
      }
    });
    
    
    
    socket.on('deleteChat', async ({ chatId, userId}: { chatId: string; userId: string }) => {
      try {


        socket.emit('deleteChatResponse');
      } catch (error) {
        socket.emit('error', { message: 'Server error' });
      }
    });
    
    socket.on('pinChat', async ({ chatId, userId }) => {
      console.log('Received pinChat request:', { chatId, userId });
      try {
        const db = getDatabase();
        const usersCollection = db.collection('users');
    
        // Fetch and log the user document
        const user = await usersCollection.findOne({
          _id: mongoose.Types.ObjectId.createFromHexString(userId),
        });
    
        console.log('Fetched user document:', user);
    
        if (!user) {
          throw new Error('User not found');
        }
    
        // Now attempt to update the document
        const result = await usersCollection.updateOne(
          {
            _id: mongoose.Types.ObjectId.createFromHexString(userId),
            'chats.chatId': chatId, // Assuming chatId is a string
          },
          {
            $set: {
              'chats.$.isPinned': { $not: ['$chats.$.isPinned'] },
            },
          }
        );
    
        console.log('Update result:', result);
    
        if (result.matchedCount === 0) {
          console.log('No matching document found');
          throw new Error('No matching document found');
        }
    
        if (result.modifiedCount === 0) {
          console.log('Document matched but not modified');
          throw new Error('Failed to pin chat');
        }
    
        console.log('Chat pinned successfully');
        socket.emit('pinChatResponse', { success: true });
      } catch (error: any) {
        socket.emit('error', { message: 'Server error: ' + error.message });
      }
    });
    
    
    socket.on('muteChat', async ({ chatId, userId }) => {
      console.log('Received muteChat request:', { chatId, userId });
      try {
        const db = getDatabase();
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({
          _id: mongoose.Types.ObjectId.createFromHexString(userId),
        });
    
        console.log('Fetched user document:', user);
    
        if (!user) {
          throw new Error('User not found');
        }
        console.log('Attempting to update document');
        const result = await usersCollection.updateOne(
          {
            _id: mongoose.Types.ObjectId.createFromHexString(userId),
            'chats.chatId': chatId  // use chatId as string
          },
          {
            $set: {
              'chats.$.isMuted': { $not: ['$chats.$.isMuted'] }
            }
          }
        );
    
        console.log('Update result:', result);
    
        if (result.matchedCount === 0) {
          console.log('No matching document found');
          throw new Error('No matching document found');
        }
    
        if (result.modifiedCount === 0) {
          console.log('Document matched but not modified');
          throw new Error('Failed to mute chat');
        }
    
        console.log('Chat muted successfully');
        socket.emit('muteChatResponse', { success: true });
      } catch (error: any) {
        socket.emit('error', { message: 'Server error: ' + error.message });
      }
    });
    
    
    
    
    
    
    
    
    
    
    

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};
