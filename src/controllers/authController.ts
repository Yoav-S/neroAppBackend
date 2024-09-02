import { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { getDatabase } from '../config/database';
import mongoose, { Document, Schema } from 'mongoose';
import nodemailer from 'nodemailer'
import { bucket } from '../config/firebaseConfig';
import otpGenerator from 'otp-generator';
import { ENV } from '../config/env';
import { AppError, ErrorCode, ErrorType, createAppError, getStatusCodeForErrorType, getUserFriendlyMessage } from '../utils/errors';
import { Types } from 'mongoose';
import { IUser, IUserCreate } from '../models/User';
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const usersCollection = db.collection('users');

    const { email, password, firstName, lastName, phone } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !phone) {
      throw createAppError(ErrorCode.MISSING_REQUIRED_FIELD);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw createAppError(ErrorCode.INVALID_EMAIL_FORMAT);
    }

    // Validate password format (example: at least 8 characters, 1 uppercase, 1 lowercase, 1 number)
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/;
    if (!passwordRegex.test(password)) {
      throw createAppError(ErrorCode.INVALID_PASSWORD_FORMAT);
    }

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      throw createAppError(ErrorCode.EMAIL_ALREADY_REGISTERED);
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userId = new mongoose.Types.ObjectId().toString();

    // Construct the default profile picture URL using Firebase Admin SDK
    try {
      const defaultImagePath = 'defaultimagesfolder/defaultprofilepicture.png';
      const file = bucket.file(defaultImagePath);
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: '03-09-2491',  // Set a long expiration date or adjust as needed
      });

      // Create the new user object with the empty chats array
      const newUser = {
        email,
        role: 'USER',
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        userId,
        picture: url,  // Use the signed URL for the profile picture
        chats: [],  // Initialize the chats array as empty
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await usersCollection.insertOne(newUser);
      if (!result.acknowledged) {
        throw createAppError(ErrorCode.DATABASE_QUERY_ERROR);
      }

      const user = await usersCollection.findOne({ _id: result.insertedId });
      if (!user) {
        throw createAppError(ErrorCode.RECORD_NOT_FOUND);
      }

      const token = jwt.sign({ userId }, ENV.JWT_SECRET || '', { expiresIn: '1h' });

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        token,
        user,
      });
    } catch (fileError) {
      console.error('Error getting default profile picture:', fileError);
      throw createAppError(ErrorCode.FILE_UPLOAD_ERROR);
    }
  } catch (error) {
    console.error('Error registering user:', error);
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  console.log(req.body);
  
  try {
    const db = getDatabase();
    const usersCollection = db.collection('users');

    const { email, password } = req.body;

    if (!email || !password) {
      throw createAppError(ErrorCode.MISSING_CREDENTIALS);
    }

    const user = await usersCollection.findOne({ email });

    if (!user) {
      throw createAppError(ErrorCode.INVALID_CREDENTIALS);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw createAppError(ErrorCode.INVALID_CREDENTIALS);
    }

    const token = jwt.sign({ userId: user._id, role: user.role }, ENV.JWT_SECRET || '', { expiresIn: '1h' });
    user.token = token;
    const userWithoutSensitiveInfo = {
      _id: user._id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      picture: user.picture,
      createdAt: user.createdAt
    };
    
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: userWithoutSensitiveInfo,
    });
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const usersCollection = db.collection('users');
    const userId = req.params.userId?.trim();

    if (!userId) {
      throw createAppError(ErrorCode.MISSING_REQUIRED_FIELD);
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw createAppError(ErrorCode.INVALID_INPUT);
    }

    const user = await usersCollection.findOne({ _id: new mongoose.Types.ObjectId(userId) });
    
    if (!user) {
      throw createAppError(ErrorCode.USER_NOT_FOUND);
    }

    // Generate a new token
    try {
      const newToken = jwt.sign(
        { userId: user._id, role: user.role },
        ENV.JWT_SECRET || '',
        { expiresIn: '1h' } // Adjust expiration time as needed
      );

      res.status(200).json({
        success: true,
        message: 'Successfully found user',
        user,
        token: newToken
      });
    } catch (jwtError) {
      console.error('Error generating JWT:', jwtError);
      throw createAppError(ErrorCode.INTERNAL_SERVER_ERROR);
    }
  } catch (error) {
    console.error('Error getting user by ID:', error);
    next(error);
  }
};

export const sendEmailOTP = async (req: Request, res: Response) => {  
  
  try {
    const db = getDatabase();
    const usersCollection = db.collection('users');
    const otpCollection = db.collection('otps');

    const email = req.params.email.trim();

    if (!email) {
      throw createAppError(ErrorCode.MISSING_REQUIRED_FIELD);
    }

    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res.status(200).json({ success: true, message: 'If a user with this email exists, an OTP has been sent.', otp: '00000' });
    }

    const otp = otpGenerator.generate(!user ? 5 : 4, {
      upperCaseAlphabets: false,
      specialChars: false,
      lowerCaseAlphabets: false
    });

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: ENV.EMAIL_USER,
        pass: ENV.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: ENV.EMAIL_USER,
      to: email,
      subject: 'Password Reset OTP',
      text: `Your OTP for password reset is: ${otp}. This code will expire in 5 minutes.`,
      html: `<b>Your OTP for password reset is: ${otp}</b><br>This code will expire in 5 minutes.`
    };

    await transporter.sendMail(mailOptions);

    const expirationTime = new Date(Date.now() + 5 * 60 * 1000);
    await otpCollection.updateOne(
      { userId: user._id.toString() },
      {
        $push: {
          otps: {
            otp: otp,
            otpExpiration: expirationTime
          } as any
        }
      },
      { upsert: true }
    );

    res.status(200).json({ success: true, message: 'OTP sent successfully', otp });
  } catch (error) {
    console.error('Error sending OTP:', error);
    if (error instanceof AppError) {
      res.status(400).json({ success: false, message: error.userMessage });
    } else {
      res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again." });
    }
  }
};


export const resetPassword = async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const usersCollection = db.collection('users');
    
    const { email, password } = req.body;

    if (!email || !password) {
      throw createAppError(ErrorCode.MISSING_REQUIRED_FIELD);
    }

    const requiredUser = await usersCollection.findOne({ email });
    
    if (!requiredUser) {
      throw createAppError(ErrorCode.USER_NOT_FOUND);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    await usersCollection.updateOne(
      { email: email },
      { $set: { password: hashedPassword } }
    );
    
    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
      data: true
    });
  } catch (error) {
    console.error('Error changing password:', error);
    if (error instanceof AppError) {
      res.status(400).json({ success: false, message: error.userMessage, data: false });
    } else {
      res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again.", data: false });
    }
  }
};

export const getNewTokenById = async (req: Request, res: Response) => {
  const { userId } = req.body;
  const db = getDatabase(); // Assuming getDatabase() function is correctly implemented
  const usersCollection = db.collection('users');

  try {


    // Generate a new JWT token
    const newToken = jwt.sign({ userId }, ENV.JWT_SECRET || '', { expiresIn: '1h' });

    // Fetch user data from the database
    const user = await usersCollection.findOne({ _id: userId });

    if (!user) {
      throw createAppError(ErrorCode.USER_NOT_FOUND);
    }

    // Send the new token and user details
    res.json({
      success: true,
      token: newToken,
      user
    });
  } catch (error) {
    if (error instanceof AppError) {
      const statusCode = getStatusCodeForErrorType(error.type);
      res.status(statusCode).json({
        success: false,
        error: error.userMessage
      });
    } else {
      // Handle unexpected errors
      console.error('Unexpected error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
};


export const loginWithGoogle = async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const usersCollection = db.collection<IUser>('users');
    const { token } = req.body;

    if (!token) {
      throw createAppError(ErrorCode.INVALID_TOKEN);
    }

    // Verify Google OAuth token
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(ENV.GOOGLE_ANDROID_CLIENT_ID);

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: ENV.GOOGLE_ANDROID_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const googleUserId = payload['sub'];
    const email = payload['email'];
    const picture = payload['picture'];

    // Check if user already exists
    let user: IUser | null = await usersCollection.findOne({ email });

    if (user) {
      // If user exists, update Google-specific fields
      await usersCollection.updateOne(
        { id: user._id },
        { 
          $set: { 
            googleUserId,
            firstName: payload['given_name'] || user.firstName,
            lastName: payload['family_name'] || user.lastName,
            picture: picture || user.picture,
            authProvider: 'GOOGLE' as const,
            updatedAt: new Date()
          }
        }
      );
      user = await usersCollection.findOne({ id: user._id });
    } else {
      // If user doesn't exist, create a new user and download the default profile picture
      const defaultImagePath = 'defaultimagesfolder/defaultprofilepicture.png';
      const file = bucket.file(defaultImagePath);
      const [metadata] = await file.getMetadata();
      const defaultPictureUrl = metadata.mediaLink;

      const newUser: IUserCreate = {
        email,
        firstName: payload['given_name'] || '',
        lastName: payload['family_name'] || '',
        role: 'USER',
        userId: new Types.ObjectId().toHexString(),
        googleUserId,
        picture: defaultPictureUrl,
        authProvider: 'GOOGLE',
      };

      const result = await usersCollection.insertOne(newUser as any);
      user = await usersCollection.findOne({ _id: result.insertedId });
    }

    if (!user) {
      throw createAppError(ErrorCode.USER_NOT_FOUND);
    }

    // Generate JWT token
    const jwtToken = jwt.sign({ userId: user.userId }, ENV.JWT_SECRET || '', { expiresIn: '1h' });

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: { ...user, token: jwtToken },
    });

  } catch (error) {
    console.error('Error during Google login:', error);
    if (error instanceof AppError) {
      res.status(400).json({ success: false, message: error.userMessage });
    } else {
      res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again." });
    }
  }
};