import { PrismaClient } from '@prisma/client';
import { loadConfig } from '../src/config';
import { seed } from './seed-data';

async function main() {
  const config = loadConfig();
  if (config.NODE_ENV === 'production') throw new Error('Refusing to seed demo data in production.');
  const password = process.env.SEED_DEFAULT_PASSWORD;
  if (!password || password.length < 10) throw new Error('Set SEED_DEFAULT_PASSWORD (min 10 chars) in .env for development accounts.');
  const prisma = new PrismaClient();
  const existing = await prisma.property.count();
  if (existing > 0 && !process.argv.includes('--force')) {
    console.log('Database already has properties; skipping seed (use --force to add another demo group).');
    await prisma.$disconnect();
    return;
  }
  const result = await seed(prisma, password);
  console.log('Seeded demo hotel group', result.groupId, 'properties:', Object.keys(result.properties).join(', '));
  console.log('Development staff accounts use SEED_DEFAULT_PASSWORD. See README "Demo accounts".');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
