// models/Message.ts
import mongoose, { Document, Schema } from 'mongoose';
import { IUser } from './User';

export interface IMessage extends Document {
  messageId: string;
  chatId: mongoose.Types.ObjectId; // The chat to which this message belongs
  sender: IUser['_id']; // Reference to the user who sent the message
  content: string; // The text content of the message
  timestamp: Date; // When the message was created
  status: 'Not delivered' | 'Sent' | 'Delivered' | 'Read' | 'Changed' | 'In progress'; // Delivery status of the message
  isEdited: boolean; // Flag to indicate if the message was edited
  reactions: Array<{ userId: IUser['_id']; reaction: string }>; // List of reactions to this message
  attachments: Array<{ attachmentId: string; type: string; url: string; thumbnail?: string }>; // List of attachments in this message
}

const MessageSchema: Schema = new Schema(
  {
    messageId: { type: String, unique: true, default: () => new mongoose.Types.ObjectId().toHexString() },
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['Not delivered', 'Sent', 'Delivered', 'Read', 'Changed', 'In progress'],
      default: 'In progress'
    },
    isEdited: { type: Boolean, default: false },

    // Reactions: stores user reactions (e.g., emojis) to the message
    reactions: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // ID of the user who reacted
        reaction: { type: String } // Type of reaction (e.g., "like", "heart", "smile")
      }
    ],

    // Attachments: stores files or media included with the message
    attachments: [
      {
        attachmentId: { type: String }, // Unique ID for the attachment
        type: { type: String }, // Type of the attachment (e.g., "image", "video", "file")
        url: { type: String }, // URL of the stored attachment
        thumbnail: { type: String } // Optional thumbnail for the attachment (e.g., for images or videos)
      }
    ]
  },
  { timestamps: true }
);

export default mongoose.model<IMessage>('Message', MessageSchema);
