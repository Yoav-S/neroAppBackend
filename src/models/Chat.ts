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
  lastMessageContent?: string;
  lastMessageTimestamp?: Date;
  chatAvatar?: string;
  messageId: mongoose.Types.ObjectId; // Reference to the message object
}

const ChatSchema: Schema = new Schema(
  {
    chatId: { type: String, unique: true, default: () => new mongoose.Types.ObjectId().toHexString() },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    isGroupChat: { type: Boolean, default: false },
    chatName: { type: String },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastMessageContent: { type: String },
    lastMessageTimestamp: { type: Date },
    chatAvatar: { type: String },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' } // New field to reference the message object
  },
  { timestamps: true }
);

export default mongoose.model<IChat>('Chat', ChatSchema);
