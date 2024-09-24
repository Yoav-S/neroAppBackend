import { bucket } from '../config/firebaseConfig';
import { CustomFile } from '../utils/interfaces';
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


    
export async function resolveUriToBuffer(uri: string): Promise<Buffer> {
  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error(`Failed to fetch image from URI: ${uri}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}


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
