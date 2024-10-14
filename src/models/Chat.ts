import mongoose, { Document, Schema } from 'mongoose';
import { IUser } from './User';

export interface IChat extends Document {
  chatId: string;
  participants: IUser['_id'][];
  createdAt: Date;
  updatedAt: Date;
  chatName?: string;
  lastMessageContent?: string;
  lastMessageDate?: Date;
  chatAvatar?: string;
  messages: Array<{
    messageId: string
    senderId: boolean;
    content: boolean;
    imageUrl?: string;
    isEdited: boolean;
    status: string;
    timestamp: Date;
  }>;
}

const ChatSchema: Schema = new Schema(
  {
    chatId: { type: String, unique: true, default: () => new mongoose.Types.ObjectId().toHexString() },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    chatName: { type: String },
    lastMessageContent: { type: String },
    lastMessageDate: { type: Date },
    chatAvatar: { type: String },
    messages: [{
      messageId: { type: String, required: true },
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      content: { type: String, required: true },
      imageUrl: { type: String },
      isEdited: { type: Boolean, default: false },
      status: { type: String, required: true },
      timestamp: { type: Date, default: Date.now }
    }]
  },
  { timestamps: true }
);

export default mongoose.model<IChat>('Chat', ChatSchema);


