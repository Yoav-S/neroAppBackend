import { Request, Response, NextFunction } from 'express';
import { MessageType, ChatDocument } from '../utils/interfaces';
import { ObjectId } from 'mongodb'; // Ensure this import is at the top of your file
import { IMessage } from '../models/Message';
import { getDatabase } from '../config/database';
import mongoose from 'mongoose';
import { createAppError, ErrorCode } from '../utils/errors';
import { bucket } from '../config/firebaseConfig';


export const getUserChats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, page = 0 } = req.body;
    const limit = 7;
    const skip = page * limit;

    // Connect to the database
    const db = getDatabase();
    const chatsCollection = db.collection('Chats');
    const usersCollection = db.collection('users');
    const messagesCollection = db.collection('Messages');

    // Convert userId to ObjectId
    const userObjectId = mongoose.Types.ObjectId.createFromHexString(userId);

    console.log(`Fetching chats for user: ${userId} (ObjectId: ${userObjectId}), Page: ${page}, Limit: ${limit}, Skip: ${skip}`);

    // Fetch chats where the user is a participant
    const chats = await chatsCollection
      .find({ participants: userObjectId })
      .skip(skip)
      .limit(limit)
      .toArray();

    console.log(`Fetched chats: ${JSON.stringify(chats)}`);

    // Check if chats were found
    if (!chats || chats.length === 0) {
      console.log('No chats found for the user.');
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          isMore: false,
          page,
          totalPages: 0,
          totalChats: 0
        }
      });
    }

    // Prepare an array to store the result with other user details
    const resultChats = await Promise.all(
      chats.map(async (chat) => {
        console.log(`Processing chat: ${chat.chatId}`);

        // Determine the other participant's ID (assuming only 2 participants)
        const otherParticipantId = chat.participants.find((id: mongoose.Types.ObjectId) => id.toString() !== userObjectId.toString());

        console.log(`Other participant ID: ${otherParticipantId}`);

        // Fetch the other user's profile information
        const otherUser = await usersCollection.findOne(
          { _id: otherParticipantId },
          { projection: { picture: 1, firstName: 1, lastName: 1 } }
        );

        console.log(`Other user details: ${JSON.stringify(otherUser)}`);

        // Fetch the last message details from the Messages collection
        const lastMessage = await messagesCollection.findOne(
          { chatId: chat._id }, // Match the chatId with the chat's _id
          {
            projection: {
              messages: { $slice: -1 } // Get the last message in the array
            }
          }
        );

        const lastMessageContent = lastMessage?.messages[0]?.content || '';
        const lastMessageTimestamp = lastMessage?.messages[0]?.timestamp || '';

        // Map to the ChatListProps format
        const chatDetails = {
          chatId: chat.chatId,
          profilePicture: otherUser ? otherUser.picture : '',
          fullName: otherUser ? `${otherUser.firstName} ${otherUser.lastName}` : '',
          lastMessageText: lastMessageContent,
          lastMessageDate: lastMessageTimestamp ? formatLastMessageDate(lastMessageTimestamp) : '',
          recieverId: otherParticipantId,
          isPinned: false // Assume false unless you have pinning functionality
        };

        console.log(`Mapped chat details: ${JSON.stringify(chatDetails)}`);
        return chatDetails;
      })
    );

    console.log('Final resultChats:', resultChats);

    // Send the response with the chats and pagination info
    res.status(200).json({
      success: true,
      data: resultChats,
      pagination: {
        isMore: resultChats.length === limit,
        page,
        totalPages: Math.ceil(chats.length / limit),
        totalChats: chats.length
      }
    });
  } catch (error) {
    console.error('Error in getUserChats:', error);
    next(error);
  }
};

export const getChatMessages = async (req: Request, res: Response) => {
  try {
    const { chatId, pageNumber } = req.body;
    const pageSize = 20; // You can adjust this or make it a parameter

    if (!ObjectId.isValid(chatId)) {
      return res.status(400).json({ success: false, message: 'Invalid chat ID' });
    }

    // Ensure pageNumber is a positive integer
    const page = Math.max(1, Math.floor(Number(pageNumber) || 1));
    const skip = (page - 1) * pageSize;

    const db = getDatabase();
    const messagesCollection = db.collection('Messages');

    const pipeline = [
      { $match: { chatId: new ObjectId(chatId) } },
      { $unwind: '$messages' },
      { $sort: { 'messages.timestamp': -1 } },
      { $skip: skip },
      { $limit: pageSize },
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
          status: '$messages.status'
        }
      }
    ];

    const chatMessages = await messagesCollection.aggregate(pipeline).toArray();

    // Format the time for each message
    const formattedChatMessages = chatMessages.map(message => ({
      ...message,
      formattedTime: formatTime(new Date(message.messageDate))
    }));

    const totalMessagesResult = await messagesCollection.aggregate([
      { $match: { chatId: new ObjectId(chatId) } },
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
    console.error('Error in getChatMessages:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};



export const SendMessage = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw createAppError(ErrorCode.INVALID_TOKEN);
  }

  const { chatId, sender, messageText } = req.body;
  const images = req.files as Express.Multer.File[];

  try {
    const db = getDatabase();
    const messagesCollection = db.collection<ChatDocument>('Messages');

    const existingMessage = await messagesCollection.findOne({ chatId: ObjectId.createFromHexString(chatId) });

    if (!existingMessage) {
      throw createAppError(ErrorCode.CHAT_NOT_FOUND);
    }

    const newMessages: MessageType[] = [];

    // Add text message with first image (if exists)
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

    // Add remaining images as separate messages
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

    // Update the message document with new messages
    const result = await messagesCollection.updateOne(
      { chatId: ObjectId.createFromHexString(chatId) },
      { $push: { messages: { $each: newMessages } } }
    );

    if (result.modifiedCount === 0) {
      throw createAppError(ErrorCode.FILE_UPLOAD_ERROR);
    }

    res.status(200).json({ success: true, messages: newMessages });
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
const formatLastMessageDate = (timestamp: Date): string => {
  const now = new Date();
  const messageDate = new Date(timestamp);

  const isSameDay = (date1: Date, date2: Date) =>
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate();

  if (isSameDay(now, messageDate)) {
    // Today: show time in 24-hour format
    return messageDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } else if (
    now.getDate() - messageDate.getDate() === 1 &&
    now.getMonth() === messageDate.getMonth() &&
    now.getFullYear() === messageDate.getFullYear()
  ) {
    // Yesterday
    return 'Yesterday';
  } else {
    // Any other day: show formatted date
    return messageDate.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  }
};
//
const formatTime = (date: Date): string => {
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};