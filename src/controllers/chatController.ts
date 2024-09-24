import mongoose from 'mongoose';
import { bucket } from '../config/firebaseConfig';
import { CustomFile } from '../utils/interfaces';
import RNFetchBlob from 'rn-fetch-blob';
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


    
export async function resolveUriToBuffer(uri: string, fileName: string, mimeType: string): Promise<{ originalname: string; mimetype: string; buffer: Buffer }> {
  try {
    const path = await RNFetchBlob.fs.stat(uri); // Get the file path from the URI
    const fileBuffer = await RNFetchBlob.fs.readFile(path.path, 'base64'); // Read the file as a base64 string

    return {
      originalname: fileName, // Pass the original file name
      mimetype: mimeType, // Pass the mime type
      buffer: Buffer.from(fileBuffer, 'base64'), // Convert base64 string to Buffer
    };
  } catch (error) {
    console.error('Error resolving URI to buffer:', error);
    throw new Error('Image buffer is missing');
  }
}

// Upload image to cloud storage
export async function uploadImage(chatId: string, image: { originalname: string, mimetype: string, buffer: Buffer }): Promise<string> {
  const uniqueFilename = `Chats/${chatId}/${image.originalname}`;
  const file = bucket.file(uniqueFilename);

  // Ensure that buffer is properly populated
  if (!image.buffer) {
    throw new Error('Image buffer is missing');
  }

  await file.save(image.buffer, {
    metadata: {
      contentType: image.mimetype,
    },
    public: true, // Ensure the file is publicly accessible
  });

  return `https://storage.googleapis.com/${bucket.name}/${uniqueFilename}`;
}
export async function createTextMessage(sender: string, messageText: string, images: any[], chatId: string) {
  const imageUrl = images.length > 0 ? await uploadImage(chatId, images[0]) : undefined; // Correctly provide both arguments
  return {
    messageId: new mongoose.Types.ObjectId(),
    sender: mongoose.Types.ObjectId.createFromHexString(sender),
    content: messageText,
    imageUrl,
    timestamp: new Date(),
    status: 'Delivered',
    isEdited: false,
    reactions: [],
    attachments: [],
  };
}

// Helper function to create image messages


// Helper function to format messages
export function formatMessages(messages: any[]) {
  return messages.map((msg) => ({
    formattedTime: msg.timestamp,
    messageId: msg.messageId.toString(),
    sender: msg.sender.toString(),
    messageText: msg.content,
    image: msg.imageUrl,
    status: msg.status,
  }));
}