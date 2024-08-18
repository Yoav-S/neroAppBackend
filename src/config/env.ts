import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

export const ENV = {
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,
  EMAIL_SUPPORT: process.env.EMAIL_SUPPORT,
  JWT_SECRET: process.env.JWT_SECRET,
  PORT: process.env.PORT,
  MONGODB_URI: process.env.MONGODB_URI,
  GOOGLE_ANDROID_CLIENT_ID: process.env.GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID: process.env.GOOGLE_WEB_CLIENT_ID,
  FIREBASE_BUCKET_NAME: process.env.FIREBASE_BUCKET_NAME,
  FIREBASE_SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY
};

Object.entries(ENV).forEach(([key, value]) => {
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is not set.`);
  }
});
