// models/Chat.ts
import mongoose, { Document, Schema } from 'mongoose';
import { IUser } from './User';

export interface IChat extends Document {
  chatId: string;
  participants: IUser['_id'][];
  createdAt: Date;
  updatedAt: Date;
  isGroupChat: boolean;
  chatName?: string;
  admin?: IUser['_id'];
  lastMessageContent?: string; // Store last message content for quick display
  lastMessageTimestamp?: Date; // Store last message timestamp for sorting
  chatAvatar?: string;
}

const ChatSchema: Schema = new Schema(
  {
    chatId: { type: String, unique: true, default: () => new mongoose.Types.ObjectId().toHexString() },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    isGroupChat: { type: Boolean, default: false },
    chatName: { type: String },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastMessageContent: { type: String }, // New field for storing the last message content
    lastMessageTimestamp: { type: Date }, // New field for storing the last message timestamp
    chatAvatar: { type: String }
  },
  { timestamps: true }
);

export default mongoose.model<IChat>('Chat', ChatSchema);
