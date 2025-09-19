const express = require('express');
const { login, logout, register, getAllUsers } = require('../../controllers/authController/auth'); 
const router = express.Router();

// Rute login
router.post('/login', login);
router.post('/logout', logout);
router.post('/register', register);
router.get('/users', getAllUsers)

module.exports = router;
