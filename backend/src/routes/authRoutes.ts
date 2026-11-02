import { Router } from 'express';
import { loginUser } from '../controllers/authController';

const router = Router();

// Endpoint Login: POST /api/auth/login
router.post('/login', loginUser);

export default router;