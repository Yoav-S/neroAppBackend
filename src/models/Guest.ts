// models/Guest.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IGuest extends Document {
  guestId: string;
  token: string;
  role: string;
  createdAt: Date;
  lastAccessedAt: Date;
}

const GuestSchema: Schema = new Schema({
  guestId: { type: String, required: true, unique: true },
  token: { type: String },
  role: { type: String, required: true},
  createdAt: { type: Date, default: Date.now },
  lastAccessedAt: { type: Date, default: Date.now },
});

export default mongoose.model<IGuest>('Guest', GuestSchema);