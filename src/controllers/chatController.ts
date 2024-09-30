import { bucket } from '../config/firebaseConfig';
import { CustomFile } from '../utils/interfaces';
import { readFile } from 'fs/promises';

export const formatLastMessageDate = (timestamp: Date): string => {
  const now = new Date();
  const messageDate = new Date(timestamp);

  const isSameDay = (date1: Date, date2: Date) =>
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate();

  const isYesterday = (date: Date) => {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return isSameDay(yesterday, date);
  };

  if (isSameDay(now, messageDate)) {
    // Today: show time in 24-hour format
    return messageDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } else if (isYesterday(messageDate)) {
    // Yesterday
    return 'Yesterday';
  } else {
    // Any other day: show formatted date as DD/M/YYYY
    const day = messageDate.getDate().toString().padStart(2, '0');
    const month = (messageDate.getMonth() + 1).toString(); // +1 because months are 0-indexed
    const year = messageDate.getFullYear();
    return `${day}/${month}/${year}`;
  }
};

const formatTime = (date: Date): string => {
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};






