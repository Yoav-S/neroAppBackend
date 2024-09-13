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

        // Fetch all messages for this chat
        const allMessages = await messagesCollection.findOne(
          { chatId: chat._id },
          { projection: { messages: 1 } }
        );

        let unreadMessagesCount = 0;
        let recentMessages = [];
        
        if (allMessages && allMessages.messages) {
          // Reverse the messages array to start from the most recent
          const reversedMessages = allMessages.messages.reverse();
          
          for (const message of reversedMessages) {
            if (message.sender.toString() !== userObjectId.toString() && message.status !== 'Read') {
              unreadMessagesCount++;
              recentMessages.push(message);
            } else {
              // Stop counting if we reach a message from the user or a read message
              break;
            }
          }
          
          // Limit recent messages to the last 20 (or any other number you prefer)
          recentMessages = recentMessages.slice(0, 20).reverse();
        }

        // Map to the ChatListProps format
        const chatDetails = {
          chatId: chat.chatId,
          profilePicture: otherUser ? otherUser.picture : '',
          fullName: otherUser ? `${otherUser.firstName} ${otherUser.lastName}` : '',
          lastMessageText: recentMessages[0]?.content || '',
          lastMessageDate: recentMessages[0]?.timestamp ? formatLastMessageDate(recentMessages[0].timestamp) : '',
          isLastMessageSenderIsTheUser: recentMessages[0]?.sender.toString() === userObjectId.toString(),
          lastMessageStatus: recentMessages[0]?.status || '',
          recieverId: otherParticipantId.toString(),
          isPinned: false, // Assume false unless you have pinning functionality
          messagesDidntReadAmount: unreadMessagesCount,
          recentMessages: recentMessages
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

    // Transform newMessages into the format expected by the frontend
    const formattedMessages = newMessages.map((msg) => ({
      formattedTime: formatLastMessageDate(msg.timestamp),
      messageId: msg.messageId.toString(),
      sender: msg.sender.toString(),
      messageText: msg.content,
      image: msg.imageUrl,
      status: msg.status,
    }));

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