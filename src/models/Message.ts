// models/Message.ts
import mongoose, { Document, Schema } from 'mongoose';
import { IUser } from './User';

export interface IMessage extends Document {
  _id: string;
  chatId: mongoose.Types.ObjectId; // Reference to the Chat object
  messages: Array<{
    messageId: string; // Unique ID for each message within the chat
    sender: IUser['_id'];
    content: string;
    timestamp: Date;
    status: 'Not delivered' | 'Sent' | 'Delivered' | 'Read' | 'Changed' | 'In progress';
    isEdited: boolean;
    reactions: Array<{ userId: IUser['_id']; reaction: string }>;
    attachments: Array<{ attachmentId: string; type: string; url: string; thumbnail?: string }>;
  }>;
}

const MessageSchema: Schema = new Schema(
  {
    _id: { type: String, unique: true, default: () => new mongoose.Types.ObjectId().toHexString() },
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
    messages: [
      {
        messageId: { type: String, unique: true, default: () => new mongoose.Types.ObjectId().toHexString() },
        sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        status: {
          type: String,
          enum: ['Not delivered', 'Sent', 'Delivered', 'Read', 'Changed', 'In progress'],
          default: 'In progress'
        },
        isEdited: { type: Boolean, default: false },
        reactions: [
          {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            reaction: { type: String }
          }
        ],
        attachments: [
          {
            attachmentId: { type: String },
            type: { type: String },
            url: { type: String },
            thumbnail: { type: String }
          }
        ]
      }
    ]
  },
  { timestamps: true }
);

export default mongoose.model<IMessage>('Message', MessageSchema);
