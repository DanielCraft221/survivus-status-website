import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

const SALT_ROUNDS = 12

/**
 * Seed the database with initial data.
 * Creates the default admin user if one does not already exist.
 */
export async function seedDatabase(): Promise<void> {
  const adminUsername = process.env.ADMIN_USER || 'admin'
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'

  // Check if an admin user already exists
  const existingUser = await db.user.findUnique({
    where: { username: adminUsername },
  })

  if (existingUser) {
    console.log(`Admin user "${adminUsername}" already exists, skipping seed.`)
    return
  }

  // Create the admin user
  const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS)

  const user = await db.user.create({
    data: {
      username: adminUsername,
      passwordHash,
      mustChangePwd: true,
    },
  })

  console.log(`Admin user "${user.username}" created successfully (id: ${user.id}).`)
}