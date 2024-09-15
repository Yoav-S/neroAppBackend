import mongoose, { Document, Schema } from 'mongoose';
import { IUser } from './User';

export interface IChat extends Document {
  chatId: string;
  participants: IUser['_id'][];
  createdAt: Date;
  updatedAt: Date;
  chatName?: string;
  lastMessageContent?: string;
  lastMessageTimestamp?: Date;
  chatAvatar?: string;
}

const ChatSchema: Schema = new Schema(
  {
    chatId: { type: String, unique: true, default: () => new mongoose.Types.ObjectId().toHexString() },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    chatName: { type: String },
    lastMessageContent: { type: String },
    lastMessageTimestamp: { type: Date },
    chatAvatar: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<IChat>('Chat', ChatSchema);
