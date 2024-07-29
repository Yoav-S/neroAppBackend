// models/User.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  role: string;
  phone?: string;
  profilePicture: string;
  userId: string;
  token?: string;
  googleUserId?: string;
  picture?: string;
  authProvider: 'LOCAL' | 'GOOGLE';
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserCreate {
  email: string;
  firstName: string;
  lastName: string;
  profilePicture?: string;
  role: string;
  userId: string;
  googleUserId?: string;
  picture?: string;
  authProvider: 'LOCAL' | 'GOOGLE';
}

const UserSchema: Schema = new Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String },
  role: { type: String, required: true},
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String },
  profilePicture: {type: String, required: true},
  userId: { type: String, unique: true, default: () => new mongoose.Types.ObjectId().toHexString() },
  token: { type: String },
  googleUserId: { type: String },
  picture: { type: String },
  authProvider: { type: String, enum: ['LOCAL', 'GOOGLE'], required: true },
}, { timestamps: true });

export default mongoose.model<IUser>('Users', UserSchema);