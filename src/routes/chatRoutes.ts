import express from 'express';
import { getUserChats, getChatMessages, SendMessage } from '../controllers/chatController';
import  upload  from '../config/multer';

const router = express.Router();

router.post('/getUserChats', getUserChats);
router.post ('/getChatMessages', getChatMessages)
router.post ('/SendMessage', upload.array('imagesUrl', 10), SendMessage);

export default router;