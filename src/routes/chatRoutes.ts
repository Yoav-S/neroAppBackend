import express from 'express';
import { updateMessageStatus, getChatMessages, sendMessage, getUserChats, createChat } from '../controllers/chatController';

const router = express.Router();

router.post('/createChat', createChat);
router.get('/getUserChats/:pageNumber', getUserChats);
router.get('/sendMessage', sendMessage)
router.post('/getChatMessages', getChatMessages);
router.post('/updateMessageStatus', updateMessageStatus);
export default router;