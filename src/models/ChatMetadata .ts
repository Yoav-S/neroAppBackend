import { Schema, model } from 'mongoose';

const chatMetadataSchema = new Schema({
    chatId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Chat'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    chatName: {
        type: String,
        required: false
    },
    chatType: {
        type: String,
        enum: ['group', 'direct'],
        default: 'direct'
    }
});

const ChatMetadata = model('ChatMetadata', chatMetadataSchema);

export default ChatMetadata;
