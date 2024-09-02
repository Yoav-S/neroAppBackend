import { Request, Response, NextFunction } from 'express';
import Chat from '../models/Chat';
import Message from '../models/Message';
import { createAppError, ErrorCode } from '../utils/errors';

// Create a new chat
export const createChat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { participants, isGroupChat, chatName, admin } = req.body;

    if (!participants || participants.length < 2) {
      throw createAppError(ErrorCode.INVALID_INPUT); // Use a valid error code from your list
    }

    if (isGroupChat && !admin) {
      throw createAppError(ErrorCode.INVALID_INPUT); // Use a valid error code from your list
    }

    const newChat = await Chat.create({
      participants,
      isGroupChat,
      chatName: isGroupChat ? chatName : undefined,
      admin: isGroupChat ? admin : undefined,
    });

    res.status(201).json({ chat: newChat });
  } catch (error) {
    next(error);
  }
};

// Fetch all chats for a user
export const getUserChats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;

    const chats = await Chat.find({ participants: userId })
      .populate('participants', 'username')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });

    res.status(200).json({ chats });
  } catch (error) {
    next(error);
  }
};

// Send a message in a chat
export const sendMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatId, sender, content, attachments } = req.body;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      throw createAppError(ErrorCode.CHAT_NOT_FOUND); // Use a valid error code from your list
    }

    const newMessage = await Message.create({
      chatId,
      sender,
      content,
      attachments,
    });

    chat.lastMessage = newMessage._id;
    chat.messages.push(newMessage._id);
    chat.unreadMessagesCount += 1; // Increment unread count
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
