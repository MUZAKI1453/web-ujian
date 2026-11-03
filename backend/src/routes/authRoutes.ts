import { Router } from 'express';
import { loginUser, changePassword } from '../controllers/authController';

import { requireUser } from '../middleware/auth';

const router = Router();

// Endpoint Login: POST /api/auth/login
router.post('/login', loginUser);

router.put('/password', requireUser, changePassword);

export default router;