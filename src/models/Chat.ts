// models/Chat.ts
import mongoose, { Document, Schema } from 'mongoose';
import { IUser } from './User';
import { IMessage } from './Message';

export interface IChat extends Document {
  chatId: string;
  participants: IUser['_id'][];
  messages: IMessage['_id'][];
  createdAt: Date;
  updatedAt: Date;
  isGroupChat: boolean;
  chatName?: string;
  admin?: IUser['_id'];
  lastMessage?: IMessage['_id'];
  unreadMessagesCount: number;
  chatAvatar?: string;
}

const ChatSchema: Schema = new Schema(
  {
    chatId: { type: String, unique: true, default: () => new mongoose.Types.ObjectId().toHexString() },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
    isGroupChat: { type: Boolean, default: false },
    chatName: { type: String },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    unreadMessagesCount: { type: Number, default: 0 },
    chatAvatar: { type: String }
  },
  { timestamps: true }
);

export default mongoose.model<IChat>('Chat', ChatSchema);
