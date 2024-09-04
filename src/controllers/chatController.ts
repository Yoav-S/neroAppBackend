import { Request, Response, NextFunction } from 'express';

import { ObjectId } from 'mongodb'; // Ensure this import is at the top of your file

import { getDatabase } from '../config/database';


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
    const userObjectId =  ObjectId.createFromHexString(userId);

    console.log(`Fetching chats for user: ${userId} (ObjectId: ${userObjectId}), Page: ${page}, Limit: ${limit}, Skip: ${skip}`);

    // Fetch chats where the user is a participant
    const chats = await chatsCollection
      .find({participants: userObjectId}) 
      .skip(skip)
      .limit(limit)
      .toArray();

    console.log(`Fetched chats: ${JSON.stringify(chats)}`);

    // Check if chats were found
    if (!chats || chats.length === 0) {
      console.log('No chats found for the user.');
    }

    // Prepare an array to store the result with other user details
    const resultChats = await Promise.all(
      chats.map(async (chat) => {
        console.log(`Processing chat: ${chat.chatId}`);

        // Determine the other participant's ID (assuming only 2 participants)
        const otherParticipantId = chat.participants.find((id: ObjectId) => id.toString() !== userObjectId.toString());

        console.log(`Other participant ID: ${otherParticipantId}`);

        // Fetch the other user's profile information
        const otherUser = await usersCollection.findOne(
          { _id: otherParticipantId },
          { projection: { picture: 1, firstName: 1, lastName: 1 } }
        );

        console.log(`Other user details: ${JSON.stringify(otherUser)}`);

        // Fetch the last message details
        const lastMessage = chat.lastMessage
          ? await messagesCollection.findOne(
              { _id: chat.lastMessage },
              { projection: { content: 1, timestamp: 1 } }
            )
          : null;

        console.log(`Last message details: ${JSON.stringify(lastMessage)}`);

        // Map to the ChatListProps format
        const chatDetails = {
          chatId: chat.chatId,
          profilePicture: otherUser ? otherUser.picture : '',
          fullName: otherUser ? `${otherUser.firstName} ${otherUser.lastName}` : '',
          lastMessageText: lastMessage ? lastMessage.content : '',
          lastMessageDate: lastMessage ? formatLastMessageDate(lastMessage.timestamp) : '',
          recieverId: otherParticipantId,
          isPinned: false, // Assume false unless you have pinning functionality
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
        isMore: (page + 1) * limit < chats.length,
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


const formatLastMessageDate = (timestamp: Date) => {
  const now: any = new Date();
  const messageDate: any = new Date(timestamp);
  
  const diffInDays = Math.floor((now - messageDate) / (1000 * 60 * 60 * 24));
  
  if (diffInDays === 0) {
    // Today: show time
    return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffInDays === 1) {
    // Yesterday
    return 'Yesterday';
  } else if (diffInDays < 7) {
    // Within a week: show day name
    return messageDate.toLocaleDateString([], { weekday: 'long' });
  } else {
    // More than a week ago: show date
    return messageDate.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  }
};
//