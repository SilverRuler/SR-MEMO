const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'firebase-key.json'), 'utf8'));
const DB_FILE = path.resolve(__dirname, 'memos_v3.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://sr-memo-default-rtdb.firebaseio.com/'
});

const db = admin.database();

async function migrate() {
  if (!fs.existsSync(DB_FILE)) {
    console.log('No local DB file found. Skipping migration.');
    process.exit(0);
  }

  const localData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  console.log('Starting migration to Firebase...');

  try {
    await db.ref('/').set(localData);
    console.log('Migration successful!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
