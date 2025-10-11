const express = require('express');
const { login, logout, register, getAllUsers, googleLogin, getProfile, changePassword, updateProfilePhoto, getProfilePhoto } = require('../../controllers/authController/auth'); 
const { forgotPassword, resetPassword } = require('../../controllers/authController/passwordReset');
const router = express.Router();
const authMiddleware = require('../../middlewares/authMiddleware');
const upload = require('../../middlewares/upload');

// Rute login
router.post('/login', login);
router.post('/logout', logout);
router.post('/register', register);
router.post('/google', googleLogin);
router.get('/users', getAllUsers)

// Profile & password
router.get('/me', authMiddleware, getProfile);
router.patch('/change-password', authMiddleware, changePassword);
router.patch('/photo', authMiddleware, upload.single('photo'), updateProfilePhoto);
router.get('/photo', authMiddleware, getProfilePhoto);

// Forgot/Reset password (tanpa login)
router.post('/password/forgot', forgotPassword);
router.post('/password/reset', resetPassword);

module.exports = router;
