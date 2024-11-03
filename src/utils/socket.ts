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
    
    socket.on('createChatAttempt', async ({ senderId, recieverId }) => {
      try {
        console.log('createChatAttempt called with:', { senderId, recieverId });
    
        const db = getDatabase();
        const chatsCollection = db.collection('Chats');
        const usersCollection = db.collection('users');
    
        console.log('Connected to database and collections');
    
        // Check if a chat with these participants already exists
        const existingChat = await chatsCollection.findOne({
          participants: {
            $all: [
              mongoose.Types.ObjectId.createFromHexString(senderId),
              mongoose.Types.ObjectId.createFromHexString(recieverId),
            ]
          }
        });
    
        console.log('Existing chat search result:', existingChat);
    
        if (existingChat) {
          console.log('Chat already exists with ID:', existingChat._id);
          socket.emit('chatCreated', { success: true, chatId: existingChat._id });
          return;
        }
    
        // Create a new chat with `chatId` matching `_id`
        const chatObjectId = new mongoose.Types.ObjectId();
        const newChat = {
          _id: chatObjectId,
          chatId: chatObjectId.toHexString(),
          participants: [
            mongoose.Types.ObjectId.createFromHexString(senderId),
            mongoose.Types.ObjectId.createFromHexString(recieverId),
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageContent: "", // Initialize lastMessageContent
          lastMessageDate: null,  // Initialize lastMessageDate
          messages: [],
        };
    
        console.log('Creating new chat with data:', newChat);
    
        const result = await chatsCollection.insertOne(newChat);
    
        console.log('Chat insertion result:', result);
    
        if (result.insertedId) {
          console.log('New chat created with ID:', result.insertedId);
    
          // Update the `chats` array in each user's document
          const updateSenderResult = await usersCollection.updateOne(
            { userId: senderId },
            { $push: { chats: { chatId: result.insertedId, isPinned: false, isMuted: false } as any } }
          );
    
          const updateReceiverResult = await usersCollection.updateOne(
            { userId: recieverId },
            { $push: { chats: { chatId: result.insertedId, isPinned: false, isMuted: false } as any } }
          );
    
          console.log('Update sender result:', updateSenderResult);
          console.log('Update receiver result:', updateReceiverResult);
    
          // Emit a successful chat creation event
          socket.emit('chatCreated', { success: true, chatId: result.insertedId });
        } else {
          console.error('Failed to insert new chat');
          throw new Error('Failed to create chat');
        }
      } catch (error) {
        console.error('Error in createChatAttempt:', error);
        socket.emit('chatCreated', { success: false });
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
        let lastMessageContent = messageText;
        let lastMessageDate = new Date();
    
        // Handle text-only messages
        if (messageText && images.length === 0) {
          const textMessage = {
            messageId: new mongoose.Types.ObjectId(),
            senderId: mongoose.Types.ObjectId.createFromHexString(sender),
            content: messageText,
            imageUrl: null,
            timestamp: lastMessageDate,
            status: 'Delivered',
            isEdited: false,
          };
          newMessages.push(textMessage);
        }
    
        // Process image messages
        for (const [index, image] of images.entries()) {
          const uniqueFilename = `Chats/${chatId}/${image.name}`;
          const file = bucket.file(uniqueFilename);
    
          try {
            const base64Data = image.base64;
            const fileBuffer = Buffer.from(base64Data, 'base64');
    
            await file.save(fileBuffer, {
              metadata: { contentType: image.type },
              public: true,
            });
    
            const imageUrl = `https://storage.googleapis.com/${bucket.name}/${uniqueFilename}`;
    
            const imageMessage = {
              messageId: new mongoose.Types.ObjectId(),
              senderId: mongoose.Types.ObjectId.createFromHexString(sender),
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
    
        if (newMessages.length === 0) {
          throw new Error('No valid messages to send');
        }
    
        // Update messages and lastMessage fields in the Chats collection
        const result = await chatsCollection.updateOne(
          { _id: mongoose.Types.ObjectId.createFromHexString(chatId) },
          {
            $push: { messages: { $each: newMessages } as any },
            $set: { lastMessageContent, lastMessageDate },
          }
        );
    
        if (result.modifiedCount === 0) {
          throw new Error('Failed to send message');
        }
    
        // Find the chat and get the receiver's ID (the non-sender ID in participants)
        const chat = await chatsCollection.findOne({ _id: mongoose.Types.ObjectId.createFromHexString(chatId) });
        if (!chat) throw new Error('Chat not found');
        
        const receiverId = chat.participants.find((id: any) => !id.equals(sender));
        if (!receiverId) throw new Error('Receiver ID not found');
    
        // Check if receiver already has this chat in their chats array
        const receiver = await usersCollection.findOne({ userId: receiverId });
        const hasChat = receiver?.chats.some((chat: any) => chat.chatId.equals(chatId));
    
        // If receiver does not have the chat, add it
        if (!hasChat) {
          await usersCollection.updateOne(
            { userId: receiverId },
            { $push: { chats: { chatId: mongoose.Types.ObjectId.createFromHexString(chatId), isPinned: false, isMuted: false } as any } }
          );
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
