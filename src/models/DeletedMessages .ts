import { Schema, model } from 'mongoose';

const deletedMessagesSchema = new Schema({
    messageId: {
        type: Schema.Types.ObjectId,
        ref: 'Message',
        required: true
    },
    chatId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'Chat'
    },
    deletedAt: {
        type: Date,
        default: Date.now
    },
    deletedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
});

const DeletedMessages = model('DeletedMessages', deletedMessagesSchema);

export default DeletedMessages;
