import { Request, Response, NextFunction } from 'express';

import { ObjectId } from 'mongodb'; // Ensure this import is at the top of your file

import { getDatabase } from '../config/database';
import mongoose from 'mongoose';


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