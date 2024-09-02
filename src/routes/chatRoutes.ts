import express from 'express';
import { updateMessageStatus, getChatMessages, sendMessage, getUserChats, createChat } from '../controllers/chatController';
import  upload  from '../config/multer';

const router = express.Router();

router.post('/createChat', createChat);
router.post('/getUserChats', getUserChats);
router.post('/createPost', upload.array('imagesUrl', 10), sendMessage); // Adjust field name and limit as needed
router.post('/getChatMessages', getChatMessages);
router.post('/updateMessageStatus', updateMessageStatus);
export default router;