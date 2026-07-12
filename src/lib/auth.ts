import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'

const SALT_ROUNDS = 12
const TOKEN_EXPIRY = '24h'

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET environment variable is not set or too short (minimum 32 characters). ' +
      'Set a strong secret in your .env file.'
    )
  }
  return new TextEncoder().encode(secret)
}

/**
 * Hash a plain-text password using bcryptjs.
 * @param password - Plain text password
 * @returns Hashed password string
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

/**
 * Compare a plain-text password against a bcrypt hash.
 * @param password - Plain text password
 * @param hash - Hashed password
 * @returns true if passwords match
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * Sign a JWT token with the given payload.
 * Uses HS256 algorithm. Token expires in 24 hours.
 * @param payload - Object containing userId and username
 * @returns Signed JWT string
 */
export async function signToken(payload: { userId: string; username: string }): Promise<string> {
  const secret = getSecret()
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(secret)
}

/**
 * Verify and decode a JWT token.
 * @param token - JWT string
 * @returns Decoded payload or null if invalid
 */
export async function verifyToken(
  token: string
): Promise<{ userId: string; username: string } | null> {
  try {
    const secret = getSecret()
    const { payload } = await jwtVerify(token, secret)
    if (payload && typeof payload.userId === 'string' && typeof payload.username === 'string') {
      return {
        userId: payload.userId,
        username: payload.username,
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Extract the authenticated user from a Request's Authorization header or cookie.
 * @param request - The incoming HTTP request
 * @returns Decoded user payload or null if not authenticated
 */
export async function getAuthUser(
  request: Request
): Promise<{ userId: string; username: string } | null> {
  // Try Authorization header first
  let token: string | null = null
  const authHeader = request.headers.get('Authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7)
  }

  // Fallback to cookie
  if (!token) {
    const cookieHeader = request.headers.get('cookie') || ''
    const match = cookieHeader.split(';').find(c => c.trim().startsWith('token='))
    if (match) {
      token = match.trim().split('=')[1] || null
    }
  }

  if (!token) return null
  return verifyToken(token)
}