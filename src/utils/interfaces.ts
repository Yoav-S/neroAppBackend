import { ObjectId } from 'mongodb'; // Ensure this import is at the top of your file
export interface CustomFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}
export interface Filters {
    location?: {
      city: string;
      district?: string;
    };
    distance?: {
      min: number;
      max: number;
    };
    type?: string[];
    category?: string[];
    date?: string[];
    size?: string[];
  }
  export interface MessageType {
    messageId: ObjectId;  // Changed from string to ObjectId
    sender: ObjectId;
    content: string;
    imageUrl?: string;
    timestamp: Date;
    status: 'Not delivered' | 'Sent' | 'Delivered' | 'Read' | 'Changed' | 'In progress';
    isEdited: boolean;
    reactions: Array<{ userId: ObjectId; reaction: string }>;
    attachments: Array<{ attachmentId: string; type: string; url: string; thumbnail?: string }>;
  }
  