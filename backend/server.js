require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3005;
const JWT_SECRET = process.env.JWT_SECRET || 'green-it-secret-change-in-prod';
const PAGE_SIZE = 20;

// 🔹 Prisma Client
const prisma = new PrismaClient();

// 🔹 Middleware
app.use(cors());
app.use(express.json({ limit: '100kb' }));
const frontendPath = process.env.VERCEL 
  ? path.join(process.cwd(), 'frontend') 
  : path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));
// 🔹 Auth Middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const admin = (req, res, next) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  next();
};

// ============ AUTH ============
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Valid email and password (min 6 chars) required' });
  }
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, name: name || 'User' },
      select: { id: true, email: true, name: true, isAdmin: true }
    });
    
    const token = jwt.sign({ userId: user.id, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user.id, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============ ITEMS ============
// ============ ITEMS ============
// ⚠️ ORDER MATTERS: Specific routes BEFORE parameterized routes!

// 1. List all items (Public, paginated)
app.get('/api/items', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const skip = (page - 1) * PAGE_SIZE;
    const category = req.query.category;
    const where = { status: 'available', ...(category && category !== 'all' && { category }) };

    const [items, total] = await Promise.all([
      prisma.item.findMany({
        where,
        select: { id: true, title: true, category: true, condition: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: PAGE_SIZE
      }),
      prisma.item.count({ where })
    ]);

    res.json({ items, total, page, totalPages: Math.ceil(total / PAGE_SIZE) });
  } catch (err) {
    console.error('Items list error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 2. List my items (Auth required) — ✅ MOVED UP, BEFORE /:id
app.get('/api/items/mine', auth, async (req, res) => {
  try {
    const items = await prisma.item.findMany({
      where: { ownerId: req.user.userId },
      select: { id: true, title: true, category: true, condition: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(items);
  } catch (err) {
    console.error('My items error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 3. Get single item (Public) — ✅ Parameterized route comes LAST
app.get('/api/items/:id', async (req, res) => {
  try {
    const item = await prisma.item.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, title: true, description: true, category: true, condition: true, status: true, createdAt: true,
        owner: { select: { id: true, name: true, city: true } }
      }
    });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    console.error('Item detail error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 4. Create item (Auth required)
app.post('/api/items', auth, async (req, res) => {
  try {
    const { title, description, category, condition } = req.body;
    if (!title || !category || !condition) {
      return res.status(400).json({ error: 'Title, category, and condition are required' });
    }
    const item = await prisma.item.create({
      data: { ownerId: req.user.userId, title, description: description || '', category, condition },
      select: { id: true, title: true, status: true }
    });
    res.status(201).json(item);
  } catch (err) {
    console.error('Create item error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 5. Update item (Owner only)
app.put('/api/items/:id', auth, async (req, res) => {
  try {
    const { title, description, category, condition } = req.body;
    const item = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (item.ownerId !== req.user.userId) return res.status(403).json({ error: 'Unauthorized' });
    if (item.status === 'swapped') return res.status(400).json({ error: 'Cannot edit swapped item' });

    const updated = await prisma.item.update({
      where: { id: req.params.id },
      data: { title, description, category, condition },
      select: { id: true, title: true }
    });
    res.json({ message: 'Item updated', item: updated });
  } catch (err) {
    console.error('Update item error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 6. Delete item (Owner or admin)
app.delete('/api/items/:id', auth, async (req, res) => {
  try {
    const item = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (item.ownerId !== req.user.userId && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    await prisma.item.delete({ where: { id: req.params.id } });
    res.json({ message: 'Item deleted' });
  } catch (err) {
    console.error('Delete item error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});
// ============ SWAPS ============
app.post('/api/swaps', auth, async (req, res) => {
  try {
    const { offeredItemId, requestedItemId } = req.body;
    if (!offeredItemId || !requestedItemId) {
      return res.status(400).json({ error: 'Both item IDs are required' });
    }

    const [offered, requested] = await Promise.all([
      prisma.item.findUnique({ where: { id: offeredItemId } }),
      prisma.item.findUnique({ where: { id: requestedItemId } })
    ]);

    if (!offered || offered.ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'You can only offer your own items' });
    }
    if (!requested) return res.status(404).json({ error: 'Requested item not found' });
    if (requested.ownerId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot swap with yourself' });
    }
    if (offered.status !== 'available' || requested.status !== 'available') {
      return res.status(400).json({ error: 'Item no longer available' });
    }

    const swap = await prisma.swapRequest.create({
      data: { requesterId: req.user.userId, offeredItemId, requestedItemId },
      select: { id: true, status: true, createdAt: true }
    });
    res.status(201).json(swap);
  } catch (err) {
    console.error('Create swap error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/swaps/mine', auth, async (req, res) => {
  try {
    const uid = req.user.userId;
    const [sent, received] = await Promise.all([
      prisma.swapRequest.findMany({
        where: { requesterId: uid },
        select: {
          id: true, status: true, createdAt: true,
          offeredItem: { select: { id: true, title: true, category: true } },
          requestedItem: { select: { id: true, title: true, category: true, owner: { select: { id: true, name: true } } } }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.swapRequest.findMany({
        where: { requestedItem: { ownerId: uid } },
        select: {
          id: true, status: true, createdAt: true,
          offeredItem: { select: { id: true, title: true, category: true, owner: { select: { id: true, name: true } } } },
          requestedItem: { select: { id: true, title: true, category: true } }
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);
    res.json({ sent, received });
  } catch (err) {
    console.error('My swaps error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.patch('/api/swaps/:id', auth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const swap = await prisma.swapRequest.findUnique({
      where: { id: req.params.id },
      include: { offeredItem: { select: { id: true, ownerId: true } }, requestedItem: { select: { id: true, ownerId: true } } }
    });

    if (!swap) return res.status(404).json({ error: 'Swap not found' });
    if (swap.requestedItem.ownerId !== req.user.userId) {
      return res.status(403).json({ error: 'Only the owner of the requested item can respond' });
    }
    if (swap.status !== 'pending') {
      return res.status(400).json({ error: 'Swap already processed' });
    }

    if (status === 'rejected') {
      const updated = await prisma.swapRequest.update({
        where: { id: req.params.id },
        data: { status: 'rejected' },
        select: { id: true, status: true }
      });
      return res.json(updated);
    }

    // ACCEPT: Transaction
    const result = await prisma.$transaction(async (tx) => {
      await tx.item.update({ where: { id: swap.offeredItem.id }, data: { status: 'swapped' } });
      await tx.item.update({ where: { id: swap.requestedItem.id }, data: { status: 'swapped' } });
      const updated = await tx.swapRequest.update({
        where: { id: req.params.id },
        data: { status: 'accepted' },
        select: { id: true, status: true }
      });
      await tx.swapRequest.updateMany({
        where: {
          id: { not: req.params.id },
          status: 'pending',
          OR: [
            { offeredItemId: { in: [swap.offeredItem.id, swap.requestedItem.id] } },
            { requestedItemId: { in: [swap.offeredItem.id, swap.requestedItem.id] } }
          ]
        },
        data: { status: 'rejected' }
      });
      return updated;
    });

    res.json(result);
  } catch (err) {
    console.error('Update swap error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============ USERS ============
app.get('/api/users/me', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, name: true, city: true, bio: true, isAdmin: true, createdAt: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ ERROR HANDLER ============
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error' });
});

// ============ START SERVER ============
app.listen(PORT, () => {
  console.log(`🌿 EcoSwap server running on http://localhost:${PORT}`);
  console.log(`📦 Green IT mode: 100kb limit, pagination, selective queries`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});