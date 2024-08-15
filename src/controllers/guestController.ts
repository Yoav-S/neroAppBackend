import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { getDatabase } from '../config/database';
import { ENV } from '../config/env';
import { AppError, ErrorType, createAppError } from '../utils/errors';

export const loginAsAGuest = async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const guestsCollection = db.collection('guests');

    // Generate a unique guest ID
    const guestId = new mongoose.Types.ObjectId().toHexString();

    // Create a new guest document
    const guestUser = {
      guestId: guestId,
      role: 'guest',
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    };

    // Insert the guest user into the guests collection
    await guestsCollection.insertOne(guestUser);

    // Generate a JWT token for the guest user
    const token = jwt.sign(
      { guestId: guestUser.guestId, type: 'GUEST' },
      ENV.JWT_SECRET || '',
      { expiresIn: '1h' }
    );

    // Update the guest document with the token
    await guestsCollection.updateOne(
      { guestId: guestUser.guestId },
      { $set: { token: token } }
    );

    // Fetch the updated guest user
    const updatedGuestUser = await guestsCollection.findOne({ guestId: guestUser.guestId });

    // Send the response with the whole user object
    res.status(200).json({
      success: true,
      message: 'Welcome guest !',
      user: updatedGuestUser
    });
  } catch (error) {
    if (error instanceof AppError) {
      res.status(400).json({ success: false, message: error.userMessage });
    } else {
      res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again." });
    }
  }
};

// Add other guest-related functions here, like fetching guest profile, etc.
