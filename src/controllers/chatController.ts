import { Request, Response, NextFunction } from 'express';
import { MessageType } from '../utils/interfaces';
import { ObjectId } from 'mongodb'; // Ensure this import is at the top of your file
import { IMessage } from '../models/Message';
import { getDatabase } from '../config/database';
import mongoose from 'mongoose';
import { createAppError, ErrorCode } from '../utils/errors';
import { bucket } from '../config/firebaseConfig';
import { Server as SocketIOServer } from 'socket.io';




// Helper functions




// Helper functions
export const formatLastMessageDate = (timestamp: Date): string => {
  const now = new Date();
  const messageDate = new Date(timestamp);

  const isSameDay = (date1: Date, date2: Date) =>
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate();

  const isYesterday = (date: Date) => {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return isSameDay(yesterday, date);
  };

  if (isSameDay(now, messageDate)) {
    // Today: show time in 24-hour format
    return messageDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } else if (isYesterday(messageDate)) {
    // Yesterday
    return 'Yesterday';
  } else {
    // Any other day: show formatted date as DD/M/YYYY
    const day = messageDate.getDate().toString().padStart(2, '0');
    const month = (messageDate.getMonth() + 1).toString(); // +1 because months are 0-indexed
    const year = messageDate.getFullYear();
    return `${day}/${month}/${year}`;
  }
};

const formatTime = (date: Date): string => {
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const getUserChats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, page = 0 } = req.body;
    const limit = 7;
    const skip = page * limit;

    // Convert userId to ObjectId
    const userObjectId = mongoose.Types.ObjectId.createFromHexString(userId);

    // Connect to the database
    const db = getDatabase();
    const chatsCollection = db.collection('Chats');
    const usersCollection = db.collection('users');
    const messagesCollection = db.collection('Messages');

    console.log(`Fetching chats for user: ${userId}, Page: ${page}, Limit: ${limit}`);

    // Fetch chats where the user is a participant
    const chats = await chatsCollection
      .find({ participants: { $in: [userObjectId] } })
      .skip(skip)
      .limit(limit)
      .toArray();

    console.log(`Fetched chats: ${chats.length} chats found`);

    if (!chats || chats.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          isMore: false,
          page,
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

    console.log('resulted chats', resultChats);

    // Send the response
    res.status(200).json({
      success: true,
      data: resultChats,
      pagination: {
        isMore: resultChats.length === limit,
        page,
        totalPages: Math.ceil(chats.length / limit),
        totalChats: chats.length,
      },
    });
  } catch (error) {
    console.error('Error in getUserChats:', error);
    next(error);
  }
};




export const getChatMessages = async (req: Request, res: Response) => {
  try {
    const { chatId, pageNumber } = req.body;
    const pageSize = 20; // Adjust this or make it a parameter

    if (!ObjectId.isValid(chatId)) {
      return res.status(400).json({ success: false, message: 'Invalid chat ID' });
    }

    // Ensure pageNumber is a positive integer
    const page = Math.max(1, Math.floor(Number(pageNumber) || 1));
    const skip = (page - 1) * pageSize;

    const db = getDatabase();
    const messagesCollection = db.collection('Messages');

    const pipeline = [
      { $match: { chatId: ObjectId.createFromHexString(chatId) } },
      {
        $project: {
          messages: {
            $slice: [
              {
                $reverseArray: "$messages" // Reverse the array to get the latest messages first
              },
              skip,
              pageSize
            ]
          }
        }
      },
      { $unwind: '$messages' },
      {
        $lookup: {
          from: 'users',
          localField: 'messages.sender',
          foreignField: '_id',
          as: 'senderInfo'
        }
      },
      {
        $project: {
          _id: 0,
          messageId: '$messages.messageId',
          sender: { $arrayElemAt: ['$senderInfo._id', 0] },
          messageText: '$messages.content',
          messageDate: '$messages.timestamp',
          formattedTime: { $dateToString: { format: "%H:%M", date: "$messages.timestamp" } },
          status: '$messages.status',
          image: '$messages.imageUrl', // Include the optional image field
          timestamp: '$messages.timestamp' // Include the timestamp field
        }
      }
    ];

    const chatMessages = await messagesCollection.aggregate(pipeline).toArray();

    // Format the time for each message
    const formattedChatMessages = chatMessages.map((message) => ({
      messageId: message.messageId,
      sender: message.sender,
      messageText: message.messageText,
      formattedTime: message.formattedTime,
      status: message.status,
      image: message.image, // Assign image field if it exists
      timestamp: message.timestamp // Assign the timestamp field
    }));

    const totalMessagesResult = await messagesCollection.aggregate([
      { $match: { chatId: ObjectId.createFromHexString(chatId) } },
      { $project: { messageCount: { $size: '$messages' } } }
    ]).toArray();

    const totalItems = totalMessagesResult[0]?.messageCount || 0;
    const totalPages = Math.ceil(totalItems / pageSize);

    const paginationResponse = {
      success: true,
      data: formattedChatMessages,
      pagination: {
        isMore: page < totalPages,
        page: page,
        totalPages: totalPages,
        totalItems: totalItems
      }
    };

    res.json(paginationResponse);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};






export const SendMessage = (io: SocketIOServer) => async (req: Request, res: Response) => {
  const { chatId, sender, messageText } = req.body;
  const images = req.files as Express.Multer.File[];

  try {
    const db = getDatabase();
    const messagesCollection = db.collection('Messages');

    const existingMessage = await messagesCollection.findOne({ chatId: ObjectId.createFromHexString(chatId) });
    if (!existingMessage) throw createAppError(ErrorCode.CHAT_NOT_FOUND);

    const newMessages: MessageType[] = [];

    // Add the text message with the first image (if exists)
    const firstMessage: MessageType = {
      messageId: new ObjectId(),
      sender: ObjectId.createFromHexString(sender),
      content: messageText,
      imageUrl: images.length > 0 ? await uploadImage(chatId, images[0]) : undefined,
      timestamp: new Date(),
      status: 'Delivered',
      isEdited: false,
      reactions: [],
      attachments: []
    };
    newMessages.push(firstMessage);

    for (let i = 1; i < images.length; i++) {
      const imageMessage: MessageType = {
        messageId: new ObjectId(),
        sender: ObjectId.createFromHexString(sender),
        content: '',
        imageUrl: await uploadImage(chatId, images[i]),
        timestamp: new Date(),
        status: 'Delivered',
        isEdited: false,
        reactions: [],
        attachments: []
      };
      newMessages.push(imageMessage);
    }

    const result = await messagesCollection.updateOne(
      { chatId: ObjectId.createFromHexString(chatId) },
      { push: { messages: { $each: newMessages } } }
    );

    if (result.modifiedCount === 0) throw createAppError(ErrorCode.FILE_UPLOAD_ERROR);

    const formattedMessages = newMessages.map((msg) => ({
      formattedTime: formatLastMessageDate(msg.timestamp),
      messageId: msg.messageId.toString(),
      sender: msg.sender.toString(),
      messageText: msg.content,
      image: msg.imageUrl,
      status: msg.status,
    }));

    // Emit the message to all clients in the chat room
    io.to(chatId).emit('newMessage', formattedMessages);

    res.status(200).json({ success: true, messages: formattedMessages });
  } catch (error) {
    console.error('Error sending message:', error);
    throw createAppError(ErrorCode.INTERNAL_SERVER_ERROR);
  }
};

// Helper function to upload image and return URL
async function uploadImage(chatId: string, image: Express.Multer.File): Promise<string> {
  // Include 'Chats/' at the beginning of the uniqueFilename
  const uniqueFilename = `Chats/${chatId}/${image.originalname}`;
  const file = bucket.file(uniqueFilename);
  
  await file.save(image.buffer, {
    metadata: {
      contentType: image.mimetype,
    },
    public: true,
  });

  // The URL should now include 'Chats/' in the path
  return `https://storage.googleapis.com/${bucket.name}/${uniqueFilename}`;
}
