import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { ok } from '../lib/response';

// Controllers translate HTTP to plain data and back. No business logic here.

export async function register(req: Request, res: Response) {
  const user = await authService.register(req.body);
  ok(res, { user }, 201);
}

export async function login(req: Request, res: Response) {
  const result = await authService.login({ ...req.body, deviceInfo: req.headers['user-agent'] });
  ok(res, result);
}

export async function refresh(req: Request, res: Response) {
  const tokens = await authService.refresh(req.body.refreshToken, req.headers['user-agent']);
  ok(res, tokens);
}

export async function logout(req: Request, res: Response) {
  await authService.logout(req.body.refreshToken);
  ok(res, { message: 'Logged out' });
}
