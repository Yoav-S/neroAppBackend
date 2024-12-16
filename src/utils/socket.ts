import { Server, Socket } from 'socket.io';
import mongoose from 'mongoose';
import { getDatabase } from '../config/database';
import { formatLastMessageDate, formatTime } from '../controllers/chatController';
import { bucket } from '../config/firebaseConfig';
export const socketHandler = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    socket.on('joinRoom', async ({chatId}: {chatId: string;}) => {
      await socket.join(chatId);
    });
    socket.on('getChatsPagination', async ({ userId, pageNumber }: any) => {
      try {
        const limit = 7;
        const skip = pageNumber * limit;
    
        const userObjectId = new mongoose.Types.ObjectId(userId);
    
        const db = getDatabase();
        const chatsCollection = db.collection('Chats');
        const usersCollection = db.collection('users');
    
        // Fetch the user's chat list
        const user = await usersCollection.findOne(
          { _id: userObjectId },
          { projection: { chats: 1 } }
        );
    
        if (!user || !user.chats || user.chats.length === 0) {
          console.log(`No chats found for user ${userId}`);
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
    
        // Get chat IDs and metadata from user's chats array
        const userChats = user.chats;
        const userChatIds = userChats.map((chat: any) => new mongoose.Types.ObjectId(chat.chatId));
    
        // Fetch only the chats that exist in the user's chats array
        const allChats = await chatsCollection
          .find({ _id: { $in: userChatIds } })
          .toArray();
    
        // Combine chat data with user's chat metadata
        const combinedChats = allChats.map((chat: any) => {
          const userChatData = userChats.find((uc: any) => uc.chatId.equals(chat._id));
          return { ...chat, isPinned: userChatData.isPinned, isMuted: userChatData.isMuted };
        });
    
        // Separate pinned and non-pinned chats
        const pinnedChats = combinedChats.filter((chat: any) => chat.isPinned);
        const nonPinnedChats = combinedChats.filter((chat: any) => !chat.isPinned);
    
        // Separate chats with and without messages
        const chatsWithMessages = (chats: any[]) =>
          chats.filter((chat: any) => chat.messages && chat.messages.length > 0);
        const chatsWithoutMessages = (chats: any[]) =>
          chats.filter((chat: any) => !chat.messages || chat.messages.length === 0);
    
        // Sort chats with messages by timestamp
        const sortByTimestamp = (a: any, b: any) => {
          const timestampA = a.lastMessageDate;
          const timestampB = b.lastMessageDate;
          return new Date(timestampB).getTime() - new Date(timestampA).getTime();
        };
    
        const pinnedChatsWithMessages = chatsWithMessages(pinnedChats).sort(sortByTimestamp);
        const nonPinnedChatsWithMessages = chatsWithMessages(nonPinnedChats).sort(sortByTimestamp);
        const pinnedChatsWithoutMessages = chatsWithoutMessages(pinnedChats);
        const nonPinnedChatsWithoutMessages = chatsWithoutMessages(nonPinnedChats);
    
        // Combine all groups in the desired order
        const sortedChats = [
          ...pinnedChatsWithMessages,
          ...pinnedChatsWithoutMessages,
          ...nonPinnedChatsWithMessages,
          ...nonPinnedChatsWithoutMessages,
        ];
    
        // Paginate results
        const paginatedChats = sortedChats.slice(skip, skip + limit);
    
        // Map chat details
        const resultChats = await Promise.all(
          paginatedChats.map(async (chat: any) => {
            const otherParticipantIds = chat.participants.filter(
              (id: any) => id.toString() !== userObjectId.toString()
            );
    
            // Fetch the other user's info
            const otherUser = await usersCollection.findOne(
              { _id: { $in: otherParticipantIds } },
              { projection: { picture: 1, firstName: 1, lastName: 1 } }
            );
    
            const lastMessage = chat.messages ? chat.messages[chat.messages.length - 1] : null;
    
            let unreadMessagesCount = 0;
            if (chat.messages) {
              for (const message of chat.messages.reverse()) {
                if (message.senderId.toString() !== userObjectId.toString() && message.status !== 'Read') {
                  unreadMessagesCount++;
                } else {
                  break;
                }
              }
            }
    
            return {
              chatId: chat._id,
              profilePicture: otherUser?.picture || '',
              fullName: otherUser ? `${otherUser.firstName} ${otherUser.lastName}` : '',
              lastMessageText: lastMessage?.content || '',
              lastMessageDate: lastMessage?.timestamp
                ? formatLastMessageDate(new Date(lastMessage.timestamp))
                : '',
              isLastMessageSenderIsTheUser:
                lastMessage?.senderId.toString() === userObjectId.toString(),
              lastMessageStatus: lastMessage?.status || '',
              isLastMessageIsImage: lastMessage?.imageUrl ? true : false,
              receiverId: otherParticipantIds.toString(),
              isPinned: chat.isPinned,
              isMuted: chat.isMuted,
              messagesDidntReadAmount: unreadMessagesCount,
              recentMessages: chat.messages
                ? chat.messages.slice(-20).map((message: any) => ({
                    messageId: message.messageId,
                    sender: message.senderId,
                    messageText: message.content,
                    formattedTime: formatTime(new Date(message.timestamp)),
                    status: message.status,
                    image: message.imageUrl || '',
                    timestamp: message.timestamp,
                    isEdited: message.isEdited || false,
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
            isMore: sortedChats.length > (pageNumber + 1) * limit,
            page: pageNumber,
            totalPages: Math.ceil(sortedChats.length / limit),
            totalChats: sortedChats.length,
          },
        });
      } catch (error) {
        console.error("Error in getChatsPagination:", error);
        socket.emit('chatsPaginationResponse', { success: false });
      }
    });
    
    
    
    socket.on('createChatAttempt', async ({ senderId, recieverId }: { senderId: string; recieverId: string }) => {
      try {
        console.log('Starting createChatAttempt with:', { senderId, recieverId });
        
        const db = getDatabase();
        const chatsCollection = db.collection('Chats');
        const usersCollection = db.collection('users');
        
        // Convert IDs and validate them
        let senderObjectId, receiverObjectId;
        try {
          senderObjectId = new mongoose.Types.ObjectId(senderId);
          receiverObjectId = new mongoose.Types.ObjectId(recieverId);
          console.log('Converted ObjectIds:', { senderObjectId, receiverObjectId });
        } catch (error) {
          console.error('Invalid ObjectId format:', error);
          socket.emit('createChatResponse', { 
            success: false, 
            error: 'Invalid user ID format' 
          });
          return;
        }
    
        // Check for existing chat - using an array match that works in both directions
        const existingChat = await chatsCollection.findOne({
          $or: [
            { participants: [senderObjectId, receiverObjectId] },
            { participants: [receiverObjectId, senderObjectId] }
          ]
        });
    
        console.log('Existing chat search result:', existingChat);
    
        if (existingChat) {
          console.log('Found existing chat:', existingChat.chatId);
          
          // Get receiver details
          const receiver = await usersCollection.findOne({ _id: receiverObjectId });
          console.log('Retrieved receiver details:', receiver?._id);
    
          if (receiver) {
            socket.emit('createChatResponse', {
              success: true,
              chatId: existingChat.chatId,
              receiverFullName: `${receiver.firstName} ${receiver.lastName}`,
              receiverPicture: receiver.picture
            });
            return;
          }
        } else {
          console.log('No existing chat found, creating new chat');
          
          // Create new chat
          const chatObjectId = new mongoose.Types.ObjectId();
          const newChat = {
            _id: chatObjectId,
            chatId: chatObjectId.toHexString(),
            participants: [senderObjectId, receiverObjectId],
            createdAt: new Date(),
            updatedAt: new Date(),
            lastMessageContent: "",
            lastMessageDate: null,
            messages: []
          };
    
          // Insert new chat directly instead of using findOneAndUpdate
          const result = await chatsCollection.insertOne(newChat);
          console.log('New chat created:', result.insertedId);
    
          // Get receiver details
          const receiver = await usersCollection.findOne({ _id: receiverObjectId });
          console.log('Retrieved receiver details for new chat:', receiver?._id);
    
          if (receiver) {
            socket.emit('createChatResponse', {
              success: true,
              chatId: newChat.chatId,
              receiverFullName: `${receiver.firstName} ${receiver.lastName}`,
              receiverPicture: receiver.picture
            });
            return;
          }
        }
    
        socket.emit('createChatResponse', { 
          success: false,
          error: 'Could not find receiver details'
        });
    
      } catch (error) {
        console.error('Error in createChatAttempt:', error);
        socket.emit('createChatResponse', { 
          success: false,
          error: 'Internal server error'
        });
      }
    });
    
    
    

    
    
    socket.on('getChatMessagesById', async ({ publisherId, userId }: { publisherId: string; userId?: string }) => {
      try {
        if (!userId) {
          socket.emit('chatMessagesByIdResponse', {
            success: false,
            message: 'User ID is required'
          });
          return;
        }
    
        const pageSize = 10;
        const db = getDatabase();
        const chatsCollection = db.collection('Chats');
    
        const pipeline = [
          {
            $match: {
              participants: {
                $all: [
                  mongoose.Types.ObjectId.createFromHexString(publisherId),
                  mongoose.Types.ObjectId.createFromHexString(userId)
                ]
              }
            }
          },
          { $unwind: '$messages' },
          { $sort: { 'messages.timestamp': -1 } },
          { $limit: pageSize },
          {
            $project: {
              chatId: 1,
              messageId: '$messages.messageId',
              sender: '$messages.senderId',
              messageText: '$messages.content',
              formattedTime: { $dateToString: { format: '%H:%M', date: '$messages.timestamp' } },
              status: '$messages.status',
              image: { $ifNull: ['$messages.imageUrl', ''] },
              timestamp: '$messages.timestamp',
              isEdited: '$messages.isEdited'
            }
          }
        ];
    
        const chatMessages = await chatsCollection.aggregate(pipeline).toArray();
    
    
        const formattedMessages = chatMessages.map(message => ({
          formattedTime: message.formattedTime,
          image: message.image,
          isEdited: message.isEdited,
          messageId: message.messageId,
          messageText: message.messageText,
          sender: message.sender,
          status: message.status,
          timestamp: message.timestamp
        }));
    
        const response = {
          success: true,
          chatId: chatMessages[0]?.chatId, // Add this back
          data: formattedMessages,
          pagination: {
            isMore: false,
            page: 1,
            totalPages: 1,
            totalItems: formattedMessages.length
          }
        };
    
        socket.emit('chatMessagesByIdResponse', response);
      } catch (error) {
        console.error('Error fetching chat messages:', error);
        socket.emit('error', { message: 'Server error' });
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
        const chatsCollection = db.collection('Chats');
        const usersCollection = db.collection('users');
    
        let messageText = '';
        let sender = '';
        let reciever = '';
        let chatId = '';
        let images: any[] = [];
    
        // Extract data from formData
        formData._parts.forEach(([key, value]: [string, any]) => {
          if (key === 'messageText') {
            messageText = value;
          } else if (key === 'sender') {
            sender = value;
          } else if (key === 'reciever') {
            reciever = value;
          } else if (key === 'chatId') {
            chatId = value;
          } else if (key === 'imagesUrl') {
            images.push(value);
          }
        });
    
        if (!chatId || !sender || !reciever) {
          throw new Error('Chat ID, Sender, and Receiver are required');
        }
    
        const senderObjectId = mongoose.Types.ObjectId.createFromHexString(sender);
        const recieverObjectId = mongoose.Types.ObjectId.createFromHexString(reciever);
        const chatObjectId = mongoose.Types.ObjectId.createFromHexString(chatId);
    
        // Check and add chat to users' chats array if not exists
        const usersToUpdate = [
          { userId: senderObjectId, chatPartnerId: recieverObjectId },
          { userId: recieverObjectId, chatPartnerId: senderObjectId }
        ];
    
        for (const { userId, chatPartnerId } of usersToUpdate) {
          const user = await usersCollection.findOne({ _id: userId });
          
          if (!user) {
            throw new Error(`User with ID ${userId} not found`);
          }
    
          // Check if chat already exists in user's chats array
          const chatExists = user.chats.some((chat: any) => 
            chat.chatId.toString() === chatObjectId.toString()
          );
    
          // If chat doesn't exist, add it
          if (!chatExists) {
            await usersCollection.updateOne(
              { _id: userId },
              { 
                $push: { 
                  chats: { 
                    chatId: chatObjectId, 
                    isPinned: false, 
                    isMuted: false 
                  } 
                } as any
              }
            );
          }
        }
    
        let newMessages: any[] = [];
        let lastMessageContent = messageText;
        let lastMessageDate = new Date();
        
        if (messageText && images.length === 0) {
          const textMessage = {
            messageId: new mongoose.Types.ObjectId(),
            senderId: senderObjectId,
            content: messageText,
            imageUrl: null,
            timestamp: lastMessageDate,
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
              senderId: senderObjectId,
              content: index === 0 ? messageText || '' : '',
              imageUrl,
              timestamp: new Date(),
              status: 'Delivered',
              isEdited: false,
            };
    
            newMessages.push(imageMessage);
            lastMessageContent = imageUrl;
            lastMessageDate = imageMessage.timestamp;
          } catch (error) {
            console.error('Error saving image:', error);
            continue;
          }
        }
    
        // If no messages were created, throw an error
        if (newMessages.length === 0) {
          throw new Error('No valid messages to send');
        }
    
        // Save the messages to the chat's messages array in the Chats collection
        const result = await chatsCollection.updateOne(
          { _id: chatObjectId },
          {
            $push: { messages: { $each: newMessages } as any },
            $set: {
              lastMessageContent,
              lastMessageDate,
            },
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
        console.error('Error in sendMessage:', error);
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
    
    socket.on('deleteChat', async (chatId, userId) => {
      try {
        if (!chatId || !userId) {
          console.error('chatId or userId is missing');
          return socket.emit('deleteChatResponse', {
            success: false,
            message: 'Invalid chatId or userId',
          });
        }
    
        // Convert userId and chatId to ObjectId if needed
        const userObjectId = mongoose.Types.ObjectId.createFromHexString(userId);
        const chatObjectId = mongoose.Types.ObjectId.createFromHexString(chatId);
    
        console.log('User ObjectId:', userObjectId);
        console.log('Chat ObjectId:', chatObjectId);
    
        const db = getDatabase();
        const usersCollection = db.collection('users');
    
        // First, let's fetch the user document and log it
        const user = await usersCollection.findOne({ _id: userObjectId });
        console.log('User document:', JSON.stringify(user, null, 2));
    
        // Use $pull to remove the chat from the user's chats array
        const result = await usersCollection.updateOne(
          { _id: userObjectId },
          { $pull: { chats: { chatId: chatObjectId } as any } }
        );
    
        console.log('Update result:', result);
    
        if (result.modifiedCount === 0) {
          console.log(`No chat found for user ${userId} with chatId ${chatId}`);
          return socket.emit('deleteChatResponse', {
            success: false,
            message: 'Chat not found or already deleted',
          });
        }
    
        console.log(`Chat ${chatId} deleted for user ${userId}`);
        socket.emit('deleteChatResponse', {
          success: true,
          message: 'Chat deleted successfully',
        });
      } catch (error) {
        console.error("Error in deleteChat:", error);
        socket.emit('deleteChatResponse', {
          success: false,
          message: 'Server error',
        });
      }
    });
    
    socket.on('pinChat', async ({ chatId, userId }) => {
      try {
        const db = getDatabase();
        const usersCollection = db.collection('users');
    
        // First, fetch the user to find the current value of isPinned for the specific chat
        const user = await usersCollection.findOne({
          _id: mongoose.Types.ObjectId.createFromHexString(userId),
          'chats.chatId': mongoose.Types.ObjectId.createFromHexString(chatId), // Match the chatId
        });
    
        if (!user) {
          throw new Error('User or chat not found');
        }
    
        // Find the specific chat to toggle its `isPinned` value
        const chat = user.chats.find(
          (c: any) => c.chatId.toString() === chatId
        );
    
        if (!chat) {
          throw new Error('Chat not found');
        }
    
        // Toggle the `isPinned` value
        const newPinnedValue = !chat.isPinned;
    
        // Update the specific chat's `isPinned` value
        const result = await usersCollection.updateOne(
          {
            _id: mongoose.Types.ObjectId.createFromHexString(userId),
            'chats.chatId': mongoose.Types.ObjectId.createFromHexString(chatId),
          },
          {
            $set: {
              'chats.$.isPinned': newPinnedValue, // Directly set the new value
            },
          }
        );
    
        if (result.matchedCount === 0) {
          throw new Error('No matching document found');
        }
    
        socket.emit('pinChatResponse', { success: true });
      } catch (error: any) {
        socket.emit('error', { message: 'Server error: ' + error.message });
      }
    });
    
    socket.on('muteChat', async ({ chatId, userId }) => {
      try {
        const db = getDatabase();
        const usersCollection = db.collection('users');
    
        // Fetch the user to find the current value of isMuted for the specific chat
        const user = await usersCollection.findOne({
          _id: mongoose.Types.ObjectId.createFromHexString(userId),
          'chats.chatId': mongoose.Types.ObjectId.createFromHexString(chatId), // Match the chatId
        });
    
        if (!user) {
          throw new Error('User or chat not found');
        }
    
        // Find the specific chat to toggle its `isMuted` value
        const chat = user.chats.find(
          (c: any) => c.chatId.toString() === chatId
        );
    
        if (!chat) {
          throw new Error('Chat not found');
        }
    
        // Toggle the `isMuted` value
        const newMutedValue = !chat.isMuted;
    
        // Update the specific chat's `isMuted` value
        const result = await usersCollection.updateOne(
          {
            _id: mongoose.Types.ObjectId.createFromHexString(userId),
            'chats.chatId': mongoose.Types.ObjectId.createFromHexString(chatId),
          },
          {
            $set: {
              'chats.$.isMuted': newMutedValue, // Directly set the new value
            },
          }
        );
    
        if (result.matchedCount === 0) {
          throw new Error('No matching document found');
        }
    
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
