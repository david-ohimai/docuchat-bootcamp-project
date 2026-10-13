import { Router } from 'express';
import * as auth from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../lib/asyncHandler';
import { registerSchema, loginSchema, refreshSchema } from '../validators/auth.validator';

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: student@example.com }
 *               password: { type: string, minLength: 8, example: MyPassword123 }
 *     responses:
 *       201: { description: User created }
 *       400: { description: Validation error }
 *       409: { description: Email already registered }
 */
router.post('/register', validate(registerSchema), asyncHandler(auth.register));

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in and receive an access token and a refresh token
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Tokens issued }
 *       401: { description: Invalid credentials }
 */
router.post('/login', validate(loginSchema), asyncHandler(auth.login));

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Rotate the refresh token and get a new access token
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: New token pair }
 *       401: { description: Refresh token invalid, expired or already used }
 */
router.post('/refresh', validate(refreshSchema), asyncHandler(auth.refresh));

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Revoke a refresh token
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: Logged out }
 */
router.post('/logout', validate(refreshSchema), asyncHandler(auth.logout));

export default router;
