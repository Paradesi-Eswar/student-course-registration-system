const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { isAuthenticated, isStudent } = require('../middleware/auth');

// Protect all student routes
router.use(isAuthenticated, isStudent);

/**
 * @route   GET /api/student/profile
 * @desc    Get current student's personal details and summary stats
 * @access  Private (Student)
 */
router.get('/profile', async (req, res) => {
  try {
    const studentId = req.session.user.id;

    const [students] = await db.query(
      'SELECT student_id, name, roll_no, branch, email, created_at FROM students WHERE student_id = ?',
      [studentId]
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student record not found in the database.'
      });
    }

    const student = students[0];

    // Compute student stats: count of registered courses and total credits
    const [stats] = await db.query(
      `SELECT 
        COUNT(r.registration_id) AS total_courses,
        COALESCE(SUM(c.credits), 0) AS total_credits
       FROM registrations r
       JOIN courses c ON r.course_id = c.course_id
       WHERE r.student_id = ?`,
      [studentId]
    );

    return res.json({
      success: true,
      student: {
        ...student,
        total_courses: stats[0].total_courses || 0,
        total_credits: stats[0].total_credits || 0
      }
    });
  } catch (error) {
    console.error('Error fetching student profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve student profile details.'
    });
  }
});

/**
 * @route   GET /api/student/courses
 * @desc    View all available courses with current registration status for this student
 * @access  Private (Student)
 */
router.get('/courses', async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const { department, semester, search } = req.query;

    let query = `
      SELECT 
        c.course_id,
        c.course_code,
        c.course_name,
        c.credits,
        c.department,
        c.semester,
        c.description,
        r.registration_id,
        r.registration_date,
        r.status AS registration_status,
        CASE WHEN r.registration_id IS NOT NULL THEN 1 ELSE 0 END AS is_registered
      FROM courses c
      LEFT JOIN registrations r 
        ON c.course_id = r.course_id AND r.student_id = ?
      WHERE 1=1
    `;
    const params = [studentId];

    if (department && department !== 'all') {
      query += ' AND c.department = ?';
      params.push(department);
    }

    if (semester && semester !== 'all') {
      query += ' AND c.semester = ?';
      params.push(parseInt(semester, 10));
    }

    if (search && search.trim() !== '') {
      query += ' AND (c.course_code LIKE ? OR c.course_name LIKE ? OR c.description LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    query += ' ORDER BY c.semester ASC, c.course_code ASC';

    const [courses] = await db.query(query, params);

    // Also get distinct departments and semesters for filter dropdowns
    const [departments] = await db.query('SELECT DISTINCT department FROM courses ORDER BY department ASC');
    const [semesters] = await db.query('SELECT DISTINCT semester FROM courses ORDER BY semester ASC');

    return res.json({
      success: true,
      courses,
      filterOptions: {
        departments: departments.map(d => d.department),
        semesters: semesters.map(s => s.semester)
      }
    });
  } catch (error) {
    console.error('Error fetching available courses:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve available courses.'
    });
  }
});

/**
 * @route   POST /api/student/register-course
 * @desc    Register for an available course
 * @access  Private (Student)
 */
router.post('/register-course', async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const { course_id } = req.body;

    if (!course_id) {
      return res.status(400).json({
        success: false,
        message: 'Course ID is required to register.'
      });
    }

    const courseIdNum = parseInt(course_id, 10);
    if (isNaN(courseIdNum)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course ID.'
      });
    }

    // Business Rule 2: Only existing students can register for courses
    const [students] = await db.query(
      'SELECT student_id, name FROM students WHERE student_id = ?',
      [studentId]
    );
    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student account does not exist. Registration not allowed.'
      });
    }

    // Business Rule 3: Students can register only for courses that exist in the courses table
    const [courses] = await db.query(
      'SELECT course_id, course_code, course_name, credits FROM courses WHERE course_id = ?',
      [courseIdNum]
    );
    if (courses.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'The requested course does not exist.'
      });
    }
    const course = courses[0];

    // Business Rule 1 & 6: Prevent duplicate registration for the same course
    const [existingReg] = await db.query(
      'SELECT registration_id, registration_date, status FROM registrations WHERE student_id = ? AND course_id = ?',
      [studentId, courseIdNum]
    );

    if (existingReg.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Duplicate Registration Prevented: You are already registered for ${course.course_code} - ${course.course_name} (Status: ${existingReg[0].status}).`
      });
    }

    // Business Rule 6 & 7: Automatically store registration date & maintain status
    const [insertResult] = await db.query(
      'INSERT INTO registrations (student_id, course_id, registration_date, status) VALUES (?, ?, CURDATE(), ?)',
      [studentId, courseIdNum, 'Registered']
    );

    return res.status(201).json({
      success: true,
      message: `Successfully registered for ${course.course_code}: ${course.course_name}!`,
      registration: {
        registration_id: insertResult.insertId,
        student_id: studentId,
        course_id: courseIdNum,
        course_code: course.course_code,
        course_name: course.course_name,
        status: 'Registered',
        registration_date: new Date().toISOString().split('T')[0]
      }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'You are already registered for this course.'
      });
    }
    console.error('Error registering course:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process course registration.'
    });
  }
});

/**
 * @route   GET /api/student/my-courses
 * @desc    View all courses registered by the logged-in student
 * @access  Private (Student)
 */
router.get('/my-courses', async (req, res) => {
  try {
    const studentId = req.session.user.id;

    const [registeredCourses] = await db.query(
      `SELECT 
        r.registration_id,
        r.registration_date,
        r.status,
        c.course_id,
        c.course_code,
        c.course_name,
        c.credits,
        c.department,
        c.semester,
        c.description
       FROM registrations r
       JOIN courses c ON r.course_id = c.course_id
       WHERE r.student_id = ?
       ORDER BY r.registration_date DESC, c.course_code ASC`,
      [studentId]
    );

    const totalCredits = registeredCourses.reduce((sum, item) => sum + (item.credits || 0), 0);

    return res.json({
      success: true,
      courses: registeredCourses,
      totalCount: registeredCourses.length,
      totalCredits
    });
  } catch (error) {
    console.error('Error fetching registered courses:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve your registered courses.'
    });
  }
});

/**
 * @route   DELETE /api/student/drop-course/:registrationId
 * @desc    Drop / cancel a course registration
 * @access  Private (Student)
 */
router.delete('/drop-course/:registrationId', async (req, res) => {
  try {
    const studentId = req.session.user.id;
    const registrationId = parseInt(req.params.registrationId, 10);

    if (isNaN(registrationId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid registration ID.'
      });
    }

    // Verify registration belongs to this student
    const [regCheck] = await db.query(
      `SELECT r.registration_id, c.course_code, c.course_name 
       FROM registrations r
       JOIN courses c ON r.course_id = c.course_id
       WHERE r.registration_id = ? AND r.student_id = ?`,
      [registrationId, studentId]
    );

    if (regCheck.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Registration record not found or you do not have permission to modify it.'
      });
    }

    const courseInfo = regCheck[0];

    await db.query(
      'DELETE FROM registrations WHERE registration_id = ? AND student_id = ?',
      [registrationId, studentId]
    );

    return res.json({
      success: true,
      message: `Successfully dropped course ${courseInfo.course_code}: ${courseInfo.course_name}.`
    });
  } catch (error) {
    console.error('Error dropping course:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to drop course registration.'
    });
  }
});

module.exports = router;

