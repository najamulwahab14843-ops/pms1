require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const crypto = require('crypto');

// Password Hashing helpers
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedValue) {
  if (!storedValue) return false;
  if (!storedValue.includes(':')) {
    // fallback if stored in plain text or env variables
    return password === storedValue;
  }
  const [salt, originalHash] = storedValue.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === originalHash;
}

const DEFAULT_ADMINS = [
  { username: 'minha', password: 'Minha@Secure123' },
  { username: 'azam', password: 'Azam@Secure123' },
  { username: 'iqbal', password: 'Iqbal@Secure123' }
];

const app = express();
app.use(cors());
app.use(express.json());

// Server configuration
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_for_promotrack';
const MANAGER_USERNAME = process.env.MANAGER_USERNAME || 'admin';
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD || 'admin';

const isMongo = !!MONGODB_URI;

// ============================= DATABASE SETUP & SEEDING =============================
let Admin, Location, Attendance, HourlyUpdate, InventoryReport, EodReport;

if (isMongo) {
  console.log('Connecting to MongoDB...');
  mongoose.set('bufferCommands', false); // Disable query buffering so mongoose queries fail immediately instead of hanging if offline
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('Connected to MongoDB successfully.');
      // NOTE: seedDefaultLocations() intentionally NOT called.
      // No fixed/default locations are seeded — only locations added
      // via POST /api/locations will ever appear.
      seedDefaultAdmins();
    })
    .catch(err => {
      console.error('MongoDB connection error:', err);
    });

  // Mongoose Schemas
  const AdminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
  });

  const LocationSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    postcode: { type: String }
  });

  const AttendanceSchema = new mongoose.Schema({
    location: { type: String, required: true },
    name: { type: String, required: true },
    checkinTs: { type: Number, required: true },
    checkoutTs: { type: Number },
    date: { type: String, required: true }
  });

  const HourlyUpdateSchema = new mongoose.Schema({
    location: { type: String, required: true },
    promoter: { type: String, required: true },
    ts: { type: Number, required: true },
    footfall: { type: Number, default: 0 },
    activity: { type: String },
    itemsSold: [{
      item: { type: String },
      qty: { type: Number }
    }],
    lowStock: { type: Boolean, default: false },
    issues: { type: String },
    comments: { type: String }
  });

  const InventoryReportSchema = new mongoose.Schema({
    location: { type: String, required: true },
    promoter: { type: String, required: true },
    ts: { type: Number, required: true },
    stock: [{
      item: { type: String },
      qty: { type: Number }
    }],
    missing: { type: String },
    oos: { type: String },
    lowStockAlert: { type: Boolean, default: false }
  });

  const EodReportSchema = new mongoose.Schema({
    location: { type: String, required: true },
    promoter: { type: String, required: true },
    date: { type: String, required: true },
    ts: { type: Number, required: true },
    sales: { type: Number, default: 0 },
    samples: { type: Number, default: 0 },
    inventory: { type: String },
    flavours: { type: String },
    summary: { type: String },
    feedback: { type: String }
  });

  Admin = mongoose.model('Admin', AdminSchema);
  Location = mongoose.model('Location', LocationSchema);
  Attendance = mongoose.model('Attendance', AttendanceSchema);
  HourlyUpdate = mongoose.model('HourlyUpdate', HourlyUpdateSchema);
  InventoryReport = mongoose.model('InventoryReport', InventoryReportSchema);
  EodReport = mongoose.model('EodReport', EodReportSchema);
} else {
  console.warn('WARNING: MONGODB_URI environment variable is not defined.');
  console.warn('Running in in-memory database mode. Data will reset on server restarts.');
}

// In-Memory Data Store (Fallback)
let memoryAdmins = [
  { username: 'minha', password: hashPassword('Minha@Secure123') },
  { username: 'azam', password: hashPassword('Azam@Secure123') },
  { username: 'iqbal', password: hashPassword('Iqbal@Secure123') }
];

// Starts EMPTY — no fixed/default locations. Only locations added via
// POST /api/locations will ever appear here.
let memoryLocations = [];

let memoryAttendance = [];
let memoryHourlyUpdates = [];
let memoryInventoryReports = [];
let memoryEodReports = [];

// Seed default admins for MongoDB if database is empty
async function seedDefaultAdmins() {
  try {
    for (const defAdmin of DEFAULT_ADMINS) {
      const existing = await Admin.findOne({ username: defAdmin.username });
      if (!existing) {
        console.log(`Seeding admin: ${defAdmin.username}...`);
        const hashedPassword = hashPassword(defAdmin.password);
        await new Admin({
          username: defAdmin.username,
          password: hashedPassword
        }).save();
      }
    }
    console.log('Admin seeding check complete.');
  } catch (err) {
    console.error('Failed to seed admins:', err);
  }
}

// ============================= DATA ACCESS LAYER =============================
const hasMongoConnection = () => isMongo && mongoose.connection.readyState === 1;

async function findAdmin(username) {
  if (hasMongoConnection()) {
    return await Admin.findOne({ username });
  } else {
    return memoryAdmins.find(a => a.username === username);
  }
}

async function getLocations() {
  return hasMongoConnection() ? await Location.find({}) : memoryLocations;
}

async function addLocation(name, postcode) {
  if (hasMongoConnection()) {
    const loc = new Location({ name, postcode });
    await loc.save();
    return loc;
  } else {
    const newLoc = { name, postcode };
    memoryLocations.push(newLoc);
    return newLoc;
  }
}

async function getAttendance(query = {}) {
  if (hasMongoConnection()) {
    return await Attendance.find(query);
  } else {
    return memoryAttendance.filter(item => {
      for (let k in query) {
        if (item[k] !== query[k]) return false;
      }
      return true;
    });
  }
}

async function addAttendance(doc) {
  return hasMongoConnection() ? await new Attendance(doc).save() : (memoryAttendance.push(doc), doc);
}

async function updateAttendance(query, updateDoc) {
  if (hasMongoConnection()) {
    return await Attendance.updateOne(query, { $set: updateDoc });
  } else {
    // Find active checkin for promoter today (which would match the query: checkoutTs: null)
    const record = memoryAttendance.slice().reverse().find(item => {
      for (let k in query) {
        const queryVal = query[k];
        if (queryVal === null || queryVal === undefined) {
          if (item[k] !== undefined && item[k] !== null) return false;
        } else if (item[k] !== queryVal) {
          return false;
        }
      }
      return true;
    });
    if (record) {
      Object.assign(record, updateDoc);
    }
    return record;
  }
}

async function getHourlyUpdates(query = {}) {
  if (hasMongoConnection()) {
    return await HourlyUpdate.find(query);
  } else {
    return memoryHourlyUpdates.filter(item => {
      for (let k in query) {
        if (item[k] !== query[k]) return false;
      }
      return true;
    });
  }
}

async function addHourlyUpdate(doc) {
  return hasMongoConnection() ? await new HourlyUpdate(doc).save() : (memoryHourlyUpdates.push(doc), doc);
}

async function getInventoryReports(query = {}) {
  if (hasMongoConnection()) {
    return await InventoryReport.find(query);
  } else {
    return memoryInventoryReports.filter(item => {
      for (let k in query) {
        if (item[k] !== query[k]) return false;
      }
      return true;
    });
  }
}

async function addInventoryReport(doc) {
  return hasMongoConnection() ? await new InventoryReport(doc).save() : (memoryInventoryReports.push(doc), doc);
}

async function getEodReports(query = {}) {
  if (hasMongoConnection()) {
    return await EodReport.find(query);
  } else {
    return memoryEodReports.filter(item => {
      for (let k in query) {
        if (item[k] !== query[k]) return false;
      }
      return true;
    });
  }
}

async function saveEodReport(query, doc) {
  if (hasMongoConnection()) {
    return await EodReport.findOneAndUpdate(query, doc, { upsert: true, new: true });
  } else {
    const index = memoryEodReports.findIndex(item => {
      for (let k in query) {
        if (item[k] !== query[k]) return false;
      }
      return true;
    });
    if (index !== -1) {
      memoryEodReports[index] = Object.assign({}, memoryEodReports[index], doc);
      return memoryEodReports[index];
    } else {
      memoryEodReports.push(doc);
      return doc;
    }
  }
}

async function clearData() {
  if (hasMongoConnection()) {
    await Attendance.deleteMany({});
    await HourlyUpdate.deleteMany({});
    await InventoryReport.deleteMany({});
    await EodReport.deleteMany({});
  } else {
    memoryAttendance = [];
    memoryHourlyUpdates = [];
    memoryInventoryReports = [];
    memoryEodReports = [];
  }
}

// ============================= UTILS =============================
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function compileLocationState(locationName, clientDate) {
  const today = clientDate || todayStr();
  const attendance = await getAttendance({ location: locationName });
  const hourlyUpdates = await getHourlyUpdates({ location: locationName });
  const inventoryReports = await getInventoryReports({ location: locationName });
  const eodReports = await getEodReports({ location: locationName });

  const todayAttendance = attendance.filter(a => a.date === today);
  todayAttendance.sort((a, b) => b.checkinTs - a.checkinTs);
  const latestAttendance = todayAttendance[0];

  const checkin = latestAttendance ? {
    name: latestAttendance.name,
    ts: latestAttendance.checkinTs,
    date: latestAttendance.date,
    checkedOutTs: latestAttendance.checkoutTs
  } : null;

  const eod = eodReports.find(e => e.date === today) || null;

  return {
    checkin,
    attendance,
    hourlyUpdates,
    inventoryReports,
    eod
  };
}

// ============================= JWT MIDDLEWARE =============================
function authenticateToken(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized. Token missing.' });
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Forbidden. Invalid token.' });
    }
    req.user = user;
    next();
  });
}

// ============================= API ENDPOINTS =============================

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const admin = await findAdmin(username);
    if (admin && verifyPassword(password, admin.password)) {
      const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
      return res.json({ token, username });
    }
  } catch (err) {
    console.error('Error querying admin from database:', err);
  }

  if (username === MANAGER_USERNAME && password === MANAGER_PASSWORD) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username });
  } else {
    res.status(401).json({ error: 'Invalid username or password.' });
  }
});

// Logout (success stub)
app.post('/api/logout', (req, res) => {
  res.json({ success: true });
});

// Get Locations (strings)
app.get('/api/locations', async (req, res) => {
  try {
    const locations = await getLocations();
    res.json(locations.map(l => l.name));
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve locations.' });
  }
});

// Add Location
app.post('/api/locations', async (req, res) => {
  const { name, postcode } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Location name is required.' });
  }
  try {
    const result = await addLocation(name.trim(), (postcode || '').trim());
    res.json(result);
  } catch (err) {
    if (err.code === 11000) {
      res.status(400).json({ error: 'Location already exists.' });
    } else {
      res.status(500).json({ error: 'Failed to add location.' });
    }
  }
});

// Check-in
app.post('/api/checkin', async (req, res) => {
  const { location, name, date } = req.body;
  if (!location || !name) {
    return res.status(400).json({ error: 'Location and name are required.' });
  }
  try {
    const now = Date.now();
    const today = date || todayStr();
    await addAttendance({
      location,
      name,
      checkinTs: now,
      checkoutTs: null,
      date: today
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check in.' });
  }
});

// Check-out
app.post('/api/checkout', async (req, res) => {
  const { location, name } = req.body;
  if (!location || !name) {
    return res.status(400).json({ error: 'Location and name are required.' });
  }
  try {
    const now = Date.now();
    await updateAttendance(
      { location, name, checkoutTs: null },
      { checkoutTs: now }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check out.' });
  }
});

// Hourly Update
app.post('/api/hourly', async (req, res) => {
  const { location, promoter, footfall, activity, itemsSold, lowStock, issues, comments } = req.body;
  if (!location || !promoter) {
    return res.status(400).json({ error: 'Location and promoter are required.' });
  }
  try {
    await addHourlyUpdate({
      location,
      promoter,
      ts: Date.now(),
      footfall: Number(footfall) || 0,
      activity: activity || '',
      itemsSold: itemsSold || [],
      lowStock: !!lowStock,
      issues: issues || '',
      comments: comments || ''
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit hourly update.' });
  }
});

// Inventory Report
app.post('/api/inventory', async (req, res) => {
  const { location, promoter, stock, missing, oos, lowStockAlert } = req.body;
  if (!location || !promoter) {
    return res.status(400).json({ error: 'Location and promoter are required.' });
  }
  try {
    await addInventoryReport({
      location,
      promoter,
      ts: Date.now(),
      stock: stock || [],
      missing: missing || '',
      oos: oos || '',
      lowStockAlert: !!lowStockAlert
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit inventory report.' });
  }
});

// End of Day (EOD)
app.post('/api/eod', async (req, res) => {
  const { location, promoter, sales, samples, inventory, flavours, summary, feedback, date } = req.body;
  if (!location || !promoter) {
    return res.status(400).json({ error: 'Location and promoter are required.' });
  }
  try {
    const today = date || todayStr();
    await saveEodReport(
      { location, promoter, date: today },
      {
        location,
        promoter,
        date: today,
        ts: Date.now(),
        sales: Number(sales) || 0,
        samples: Number(samples) || 0,
        inventory: inventory || '',
        flavours: flavours || '',
        summary: summary || '',
        feedback: feedback || ''
      }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit end of day report.' });
  }
});

// Clear/Reset Demo Data (Protected)
app.post('/api/reset', authenticateToken, async (req, res) => {
  try {
    await clearData();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset demo data.' });
  }
});

// Manager Dashboard State (Protected)
app.get('/api/state', authenticateToken, async (req, res) => {
  try {
    const locations = await getLocations();
    const postcodes = {};
    const data = {};
    const clientDate = req.query.today;

    for (let loc of locations) {
      postcodes[loc.name] = loc.postcode || '';
      data[loc.name] = await compileLocationState(loc.name, clientDate);
    }

    res.json({
      locations: locations.map(l => l.name),
      postcodes,
      data
    });
  } catch (err) {
    console.error('Error fetching manager state:', err);
    res.status(500).json({ error: 'Failed to load manager dashboard state.' });
  }
});

// Promoter Portal State
app.get('/api/promoter-state', async (req, res) => {
  const { location, today } = req.query;
  if (!location) {
    return res.status(400).json({ error: 'Location query parameter is required.' });
  }
  try {
    const data = await compileLocationState(location, today);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load promoter state.' });
  }
});

// ============================= LOCAL STATIC FILE SERVING =============================
// Serve static client files when running standalone Express
app.use(express.static(path.join(__dirname, '../public')));

// Catch-all to serve frontend index.html for unknown routes (excluding /api)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Standalone Server Startup (only if not running on Vercel as serverless)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Server is running locally at http://127.0.0.1:${PORT}`);
  });
}

// Export the app for Vercel Serverless Function entry
module.exports = app;
