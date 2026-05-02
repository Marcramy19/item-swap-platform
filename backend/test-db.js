const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to Supabase PostgreSQL!');
    
    const users = await prisma.user.count();
    console.log(`Users in database: ${users}`);
    
    await prisma.$disconnect();
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  }
}

test();