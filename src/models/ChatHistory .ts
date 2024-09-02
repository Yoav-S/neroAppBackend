import { Schema, model } from 'mongoose';

const chatHistorySchema = new Schema({
    historyId: {
        type: Schema.Types.ObjectId,
        required: true
    },
    chatId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Chat'
    },
    messageId: {
        type: Schema.Types.ObjectId,
        ref: 'Message',
        required: false
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    actionType: {
        type: String,
        enum: ['message_sent', 'message_deleted'],
        required: true
    }
});

const ChatHistory = model('ChatHistory', chatHistorySchema);

export default ChatHistory;
