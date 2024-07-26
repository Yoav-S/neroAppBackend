import mongoose, { Document, Schema } from 'mongoose';

interface OTPEntry {
  otp: string;
  otpExpiration: Date;
}

export interface IOTP extends Document {
  userId: string;
  otps: OTPEntry[];
}

const OTPEntrySchema: Schema = new Schema({
  otp: { type: String, required: true },
  otpExpiration: { type: Date, required: true },
});

const OTPSchema: Schema = new Schema({
  userId: { type: String, required: true, ref: 'Users' },
  otps: [OTPEntrySchema],
}, { timestamps: true });

export const OTP = mongoose.model<IOTP>('OTP', OTPSchema);
