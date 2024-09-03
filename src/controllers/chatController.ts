import { Request, Response, NextFunction } from 'express';
import Chat from '../models/Chat';
import Message from '../models/Message';
import { createAppError, ErrorCode } from '../utils/errors';
import User from '../models/User';
import { bucket } from '../config/firebaseConfig';
import mongoose from 'mongoose';

// Create a new chat
export const createChat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { participants, isGroupChat, chatName, admin } = req.body;

    if (!participants || participants.length < 2) {
      throw createAppError(ErrorCode.INVALID_INPUT);
    }

    if (isGroupChat && !admin) {
      throw createAppError(ErrorCode.INVALID_INPUT);
    }
    // Create the new chat
    const newChat = await Chat.create({
      participants,
      isGroupChat,
      chatName: isGroupChat ? chatName : undefined,
      admin: isGroupChat ? admin : undefined,
    });

    // Add the chat to each participant's chat list
    await User.updateMany(
      { _id: { $in: participants } },
      { $push: { chats: newChat._id } }
    );
    res.status(201).json({ chat: newChat });
  } catch (error) {
    next(error);
  }
};


// Fetch all chats for a user
export const getUserChats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, page = 0 } = req.body; // Default to page 0 if not provided
    const limit = 7; // Number of chats per page

    // Create the filter query
    const filterQuery = { participants: userId };

    // Count total chats
    const totalChats = await Chat.countDocuments(filterQuery);

    // Calculate total pages
    const totalPages = Math.ceil(totalChats / limit);

    // Calculate the number of documents to skip
    const skip = page * limit;

    // Retrieve chats that match the filter with pagination
    const chatsForCurrentPage = await Chat.find(filterQuery)
      .populate('participants', 'username')
      .populate('lastMessage')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    // Check if there are more chats
    const isMore: boolean = (page + 1) * limit < totalChats;

    // Send the response with the chats and pagination info
    res.status(200).json({
      success: true,
      data: chatsForCurrentPage,
      pagination: {
        isMore,
        page,
        totalPages,
        totalChats
      }
    });
  } catch (error) {
    next(error);
  }
};

// Send a message in a chat
export const sendMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId, sender, content } = req.body;
    const files = req.files as Express.Multer.File[];

    const chat = await Chat.findOne({ chatId });
    if (!chat) {
      throw createAppError(ErrorCode.CHAT_NOT_FOUND);
    }


    let imageUrls: string[] = [];

    // Handle image uploads
    if (files && files.length > 0) {
      for (const file of files) {
        const uniqueFilename = `Chats/${chatId}/${Date.now()}-${file.originalname}`;
        const fileUpload = bucket.file(uniqueFilename);

        await fileUpload.save(file.buffer, {
          metadata: {
            contentType: file.mimetype,
          },
          public: true,
        });

        const fileUrl = `https://storage.googleapis.com/${bucket.name}/${uniqueFilename}`;
        imageUrls.push(fileUrl);
      }
    }

    const newMessage = new Message({
      _id: new mongoose.Types.ObjectId(),
      chatId: chat.chatId,
      sender,
      content,
      attachments: imageUrls,
    });

    await newMessage.save();

    chat.lastMessage = newMessage._id;
    chat.messages.push(newMessage._id);
    await chat.save();

    res.status(201).json({ message: newMessage });
  } catch (error) {
    next(error);
  }
};

// Fetch messages for a chat
export const getChatMessages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId } = req.params;

    const messages = await Message.find({ chatId }).sort({ timestamp: 1 });

    res.status(200).json({ messages });
  } catch (error) {
    next(error);
  }
};

// Update message status
export const updateMessageStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { messageId, status } = req.body;

    const message = await Message.findById(messageId);
    if (!message) {
      throw createAppError(ErrorCode.MESSAGE_NOT_FOUND); // Use a valid error code from your list
    }

    message.status = status;
    await message.save();

    res.status(200).json({ message });
  } catch (error) {
    next(error);
  }
};
