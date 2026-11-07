const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

/**
 * @route   POST /api/auth/student/register
 * @desc    Create a new student account
 * @access  Public
 */
router.post('/student/register', async (req, res) => {
  try {
    const { name, roll_no, branch, email, password } = req.body;

    // Backend Input Validation
    if (!name || !roll_no || !branch || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields (name, roll_no, branch, email, password) are required.'
      });
    }

    const trimmedName = name.trim();
    const trimmedRollNo = roll_no.trim().toUpperCase();
    const trimmedBranch = branch.trim();
    const trimmedEmail = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.'
      });
    }

    // Check for existing roll_no or email
    const [existingStudents] = await db.query(
      'SELECT student_id, roll_no, email FROM students WHERE roll_no = ? OR email = ?',
      [trimmedRollNo, trimmedEmail]
    );

    if (existingStudents.length > 0) {
      const match = existingStudents[0];
      if (match.roll_no === trimmedRollNo) {
        return res.status(409).json({
          success: false,
          message: `A student with Roll Number '${trimmedRollNo}' is already registered.`
        });
      }
      if (match.email.toLowerCase() === trimmedEmail) {
        return res.status(409).json({
          success: false,
          message: `A student with Email '${trimmedEmail}' is already registered.`
        });
      }
    }

    // Hash password using bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert student record
    const [result] = await db.query(
      'INSERT INTO students (name, roll_no, branch, email, password) VALUES (?, ?, ?, ?, ?)',
      [trimmedName, trimmedRollNo, trimmedBranch, trimmedEmail, hashedPassword]
    );

    return res.status(201).json({
      success: true,
      message: 'Student account created successfully! You can now log in.',
      student: {
        student_id: result.insertId,
        name: trimmedName,
        roll_no: trimmedRollNo,
        branch: trimmedBranch,
        email: trimmedEmail
      }
    });
  } catch (error) {
    console.error('Error during student registration:', error);
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred while registering the student.'
    });
  }
});

/**
 * @route   POST /api/auth/student/login
 * @desc    Authenticate student & start session
 * @access  Public
 */
router.post('/student/login', async (req, res) => {
  try {
    const { roll_no, password } = req.body;

    if (!roll_no || !password) {
      return res.status(400).json({
        success: false,
        message: 'Roll number and password are required.'
      });
    }

    const trimmedIdentifier = roll_no.trim();

    // Support login via either Roll Number or Email
    const [students] = await db.query(
      'SELECT * FROM students WHERE roll_no = ? OR email = ? LIMIT 1',
      [trimmedIdentifier.toUpperCase(), trimmedIdentifier.toLowerCase()]
    );

    if (students.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. No student account found with this Roll Number/Email.'
      });
    }

    const student = students[0];

    // Compare bcrypt password
    const isPasswordValid = await bcrypt.compare(password, student.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Incorrect password.'
      });
    }

    // Initialize session
    req.session.user = {
      id: student.student_id,
      name: student.name,
      roll_no: student.roll_no,
      branch: student.branch,
      email: student.email,
      role: 'student'
    };

    return res.json({
      success: true,
      message: `Welcome back, ${student.name}!`,
      user: req.session.user,
      redirectUrl: '/student/dashboard.html'
    });
  } catch (error) {
    console.error('Error during student login:', error);
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred during login.'
    });
  }
});

/**
 * @route   POST /api/auth/admin/login
 * @desc    Authenticate administrator & start session
 * @access  Public
 */
router.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.'
      });
    }

    const trimmedUsername = username.trim();

    const [admins] = await db.query(
      'SELECT * FROM admins WHERE username = ? OR email = ? LIMIT 1',
      [trimmedUsername, trimmedUsername.toLowerCase()]
    );

    if (admins.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid administrator credentials.'
      });
    }

    const admin = admins[0];

    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid administrator credentials. Incorrect password.'
      });
    }

    // Set admin session
    req.session.user = {
      id: admin.admin_id,
      username: admin.username,
      name: admin.name,
      email: admin.email,
      role: 'admin'
    };

    return res.json({
      success: true,
      message: `Welcome, Administrator ${admin.name}!`,
      user: req.session.user,
      redirectUrl: '/admin/dashboard.html'
    });
  } catch (error) {
    console.error('Error during admin login:', error);
    return res.status(500).json({
      success: false,
      message: 'An internal server error occurred during admin login.'
    });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current session user
 * @access  Public (returns null if unauthenticated)
 */
router.get('/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({
      authenticated: true,
      user: req.session.user
    });
  }
  return res.json({
    authenticated: false,
    user: null
  });
});

/**
 * @route   POST /api/auth/logout
 * @desc    Log out the current user and destroy session
 * @access  Public
 */
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Session destruction error:', err);
      return res.status(500).json({
        success: false,
        message: 'Could not log out at this time.'
      });
    }
    res.clearCookie('connect.sid');
    return res.json({
      success: true,
      message: 'Logged out successfully.',
      redirectUrl: '/login.html'
    });
  });
});

module.exports = router;

