import { Request, Response } from 'express';
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { getDatabase } from '../config/database';
import mongoose, { Document, Schema } from 'mongoose';
import nodemailer from 'nodemailer'
import { bucket } from '../config/firebaseConfig';
import otpGenerator from 'otp-generator';
import { ENV } from '../config/env';
import { AppError, ErrorType, createAppError, getUserFriendlyMessage } from '../utils/errors';
import { Types } from 'mongoose';
import { IUser, IUserCreate } from '../models/User';
export const register = async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const usersCollection = db.collection('users');

    const { email, password, firstName, lastName, phone } = req.body;

    if (!email || !password || !firstName || !lastName || !phone) {
      throw createAppError("All fields are required", ErrorType.VALIDATION);
    }

    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      throw createAppError("User with this email already exists", ErrorType.VALIDATION);
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userId = new mongoose.Types.ObjectId().toString();

    // Download the default profile picture
    const defaultImagePath = 'defaultimagesfolder/defaultprofilepicture.png';
    const file = bucket.file(defaultImagePath);
    const [metadata] = await file.getMetadata();
    const defaultPictureUrl = metadata.mediaLink;

    const newUser = {
      email,
      role: 'USER',
      password: hashedPassword,
      firstName,
      lastName,
      phone,
      userId,
      picture: defaultPictureUrl,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await usersCollection.insertOne(newUser);
    const user = await usersCollection.findOne({ _id: result.insertedId });

    const token = jwt.sign({ userId }, ENV.JWT_SECRET || '', { expiresIn: '1h' });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user,
    });
  } catch (error) {
    console.error('Error registering user:', error);
    if (error instanceof AppError) {
      res.status(400).json({ success: false, message: error.userMessage });
    } else {
      res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again." });
    }
  }
};
export const login = async (req: Request, res: Response) => {
  try {
    const db = getDatabase(); // Assuming getDatabase() function is correctly implemented
    const usersCollection = db.collection('users');

    const { email, password } = req.body;

    if (!email || !password) {
      throw createAppError("Email and password are required", ErrorType.VALIDATION);
    }

    const user = await usersCollection.findOne({ email });

    if (!user) {
      throw createAppError("Invalid credentials", ErrorType.AUTHENTICATION);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw createAppError("Invalid credentials", ErrorType.AUTHENTICATION);
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
    if (error instanceof AppError) {
      res.status(400).json({ success: false, message: error.userMessage });
    } else {
      res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again." });
    }
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const usersCollection = db.collection('users');
    const userId = req.params.userId.trim();
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      throw createAppError("No token provided", ErrorType.AUTHENTICATION);
    }

    jwt.verify(token, ENV.JWT_SECRET || '', async (err: any, decoded: any) => {
      if (err) {
        throw createAppError("Invalid token", ErrorType.AUTHENTICATION);
      }

      if (decoded.userId !== userId) {
        throw createAppError("Unauthorized access", ErrorType.AUTHORIZATION);
      }

      const user = await usersCollection.findOne({ _id: new mongoose.Types.ObjectId(userId) });
      if (!user) {
        throw createAppError("User not found", ErrorType.NOT_FOUND);
      }

      res.status(200).json({
        success: true,
        message: 'Successfully found user',
        user
      });
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    if (error instanceof AppError) {
      res.status(400).json({ success: false, message: error.userMessage });
    } else {
      res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again." });
    }
  }
};

export const sendEmailOTP = async (req: Request, res: Response) => {  
  
  try {
    const db = getDatabase();
    const usersCollection = db.collection('users');
    const otpCollection = db.collection('otps');

    const email = req.params.email.trim();

    if (!email) {
      throw createAppError("Email is required", ErrorType.VALIDATION);
    }

    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res.status(200).json({ success: true, message: 'If a user with this email exists, an OTP has been sent.', otp: '0000' });
    }

    const otp = otpGenerator.generate(4, {
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
      throw createAppError("Email and new password are required", ErrorType.VALIDATION);
    }

    const requiredUser = await usersCollection.findOne({ email });
    
    if (!requiredUser) {
      throw createAppError("User not found", ErrorType.NOT_FOUND);
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

export const otpVerification = async (req: Request, res: Response) => {
  try {
    const { otp, userId } = req.body;

    if (!otp || !userId) {
      throw createAppError("OTP and userId are required", ErrorType.VALIDATION);
    }

    const db = getDatabase();
    const otpCollection = db.collection('otps');
    const userOtpData = await otpCollection.findOne({ userId: userId });

    if (!userOtpData || !userOtpData.otps) {
      throw createAppError("OTP not found for this user", ErrorType.NOT_FOUND);
    }

    const currentTime = new Date();
    const validOtp = userOtpData.otps.find((o: any) => o.otp === otp && o.otpExpiration > currentTime);

    if (!validOtp) {
      throw createAppError("Invalid or expired OTP", ErrorType.VALIDATION);
    }

    // Optionally remove the used OTP
    await otpCollection.updateOne(
      { userId: userId },
      { $pull: { otps: { otp: otp } as any } }
    );

    return res.status(200).json({ success: true, message: 'OTP verified successfully' });

  } catch (error) {
    console.error('Error during OTP verification:', error);
    if (error instanceof AppError) {
      res.status(400).json({ success: false, message: error.userMessage });
    } else {
      res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again." });
    }
  }
};

export const loginWithGoogle = async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const usersCollection = db.collection<IUser>('users');
    const { token } = req.body;

    if (!token) {
      throw createAppError("Google OAuth token is required", ErrorType.VALIDATION);
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
      throw createAppError("Failed to create or retrieve user", ErrorType.SERVER_ERROR);
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