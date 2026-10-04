import PocketBase from 'pocketbase';

const url = import.meta.env.VITE_POCKETBASE_URL;
if (!url) throw new Error('Set VITE_POCKETBASE_URL in frontend/.env.local');
export const pb = new PocketBase(url);
