import express from 'express';
import { getUserById, login, register, sendEmailOTP, resetPassword, loginWithGoogle, getNewTokenById } from '../controllers/authController';

const router = express.Router();

router.post('/login', login);
router.post('/loginWithGoogle', loginWithGoogle);
router.get('/getNewTokenById/:userId', getNewTokenById)
router.post('/signup', register);
router.post('/resetPassword', resetPassword);
router.post('/sendEmailOTP/:email', sendEmailOTP);
router.get('/getUserById/:userId', getUserById); // Make sure to include :userId as a parameter
export default router;