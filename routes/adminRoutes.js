const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

// Protect all admin routes with authentication & administrator role
router.use(isAuthenticated, isAdmin);

/**
 * @route   GET /api/admin/dashboard-stats
 * @desc    Get dashboard metrics and counts
 * @access  Private (Admin)
 */
router.get('/dashboard-stats', async (req, res) => {
  try {
    const [[studentsCount]] = await db.query('SELECT COUNT(*) AS total_students FROM students');
    const [[coursesCount]] = await db.query('SELECT COUNT(*) AS total_courses FROM courses');
    const [[registrationsCount]] = await db.query('SELECT COUNT(*) AS total_registrations FROM registrations');
    const [[deptCount]] = await db.query('SELECT COUNT(DISTINCT department) AS total_departments FROM courses');

    // Recent 5 registrations
    const [recentRegistrations] = await db.query(
      `SELECT 
        r.registration_id,
        r.registration_date,
        r.status,
        s.student_id,
        s.name AS student_name,
        s.roll_no,
        c.course_id,
        c.course_code,
        c.course_name
       FROM registrations r
       JOIN students s ON r.student_id = s.student_id
       JOIN courses c ON r.course_id = c.course_id
       ORDER BY r.registration_id DESC
       LIMIT 5`
    );

    // Registrations by department
    const [deptRegistrations] = await db.query(
      `SELECT 
        c.department,
        COUNT(r.registration_id) AS reg_count
       FROM courses c
       LEFT JOIN registrations r ON c.course_id = r.course_id
       GROUP BY c.department
       ORDER BY reg_count DESC`
    );

    return res.json({
      success: true,
      stats: {
        total_students: studentsCount.total_students,
        total_courses: coursesCount.total_courses,
        total_registrations: registrationsCount.total_registrations,
        total_departments: deptCount.total_departments
      },
      recentRegistrations,
      deptRegistrations
    });
  } catch (error) {
    console.error('Error fetching admin dashboard stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve administrator dashboard statistics.'
    });
  }
});

/**
 * @route   GET /api/admin/courses
 * @desc    View all courses with student registration counts
 * @access  Private (Admin)
 */
router.get('/courses', async (req, res) => {
  try {
    const [courses] = await db.query(
      `SELECT 
        c.course_id,
        c.course_code,
        c.course_name,
        c.credits,
        c.department,
        c.semester,
        c.description,
        c.created_at,
        COUNT(r.registration_id) AS registered_students_count
       FROM courses c
       LEFT JOIN registrations r ON c.course_id = r.course_id
       GROUP BY c.course_id
       ORDER BY c.semester ASC, c.course_code ASC`
    );

    return res.json({
      success: true,
      courses
    });
  } catch (error) {
    console.error('Error fetching courses:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve course list.'
    });
  }
});

/**
 * @route   GET /api/admin/courses/:id
 * @desc    Get single course details
 * @access  Private (Admin)
 */
router.get('/courses/:id', async (req, res) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    if (isNaN(courseId)) {
      return res.status(400).json({ success: false, message: 'Invalid course ID.' });
    }

    const [courses] = await db.query(
      `SELECT 
        c.course_id,
        c.course_code,
        c.course_name,
        c.credits,
        c.department,
        c.semester,
        c.description,
        c.created_at,
        COUNT(r.registration_id) AS registered_students_count
       FROM courses c
       LEFT JOIN registrations r ON c.course_id = r.course_id
       WHERE c.course_id = ?
       GROUP BY c.course_id`,
      [courseId]
    );

    if (courses.length === 0) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    return res.json({
      success: true,
      course: courses[0]
    });
  } catch (error) {
    console.error('Error fetching course:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve course.' });
  }
});

/**
 * @route   POST /api/admin/courses
 * @desc    Add a new course
 * @access  Private (Admin)
 */
router.post('/courses', async (req, res) => {
  try {
    const { course_code, course_name, credits, department, semester, description } = req.body;

    // Backend Input Validation
    if (!course_code || !course_name || credits === undefined || !department || semester === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Course code, course name, credits, department, and semester are required.'
      });
    }

    const trimmedCode = course_code.trim().toUpperCase();
    const trimmedName = course_name.trim();
    const trimmedDept = department.trim();
    const numCredits = parseInt(credits, 10);
    const numSemester = parseInt(semester, 10);
    const courseDesc = description ? description.trim() : null;

    if (isNaN(numCredits) || numCredits <= 0) {
      return res.status(400).json({ success: false, message: 'Credits must be a positive integer.' });
    }

    if (isNaN(numSemester) || numSemester < 1 || numSemester > 12) {
      return res.status(400).json({ success: false, message: 'Semester must be a valid number between 1 and 12.' });
    }

    // Check duplicate course_code
    const [existing] = await db.query('SELECT course_id FROM courses WHERE course_code = ?', [trimmedCode]);
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Course with code '${trimmedCode}' already exists.`
      });
    }

    const [result] = await db.query(
      'INSERT INTO courses (course_code, course_name, credits, department, semester, description) VALUES (?, ?, ?, ?, ?, ?)',
      [trimmedCode, trimmedName, numCredits, trimmedDept, numSemester, courseDesc]
    );

    return res.status(201).json({
      success: true,
      message: `Course '${trimmedCode} - ${trimmedName}' added successfully!`,
      course: {
        course_id: result.insertId,
        course_code: trimmedCode,
        course_name: trimmedName,
        credits: numCredits,
        department: trimmedDept,
        semester: numSemester,
        description: courseDesc
      }
    });
  } catch (error) {
    console.error('Error adding course:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add course.'
    });
  }
});

/**
 * @route   PUT /api/admin/courses/:id
 * @desc    Modify existing course details
 * @access  Private (Admin)
 */
router.put('/courses/:id', async (req, res) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    if (isNaN(courseId)) {
      return res.status(400).json({ success: false, message: 'Invalid course ID.' });
    }

    const { course_code, course_name, credits, department, semester, description } = req.body;

    if (!course_code || !course_name || credits === undefined || !department || semester === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Course code, course name, credits, department, and semester are required.'
      });
    }

    const trimmedCode = course_code.trim().toUpperCase();
    const trimmedName = course_name.trim();
    const trimmedDept = department.trim();
    const numCredits = parseInt(credits, 10);
    const numSemester = parseInt(semester, 10);
    const courseDesc = description !== undefined ? (description ? description.trim() : null) : null;

    if (isNaN(numCredits) || numCredits <= 0) {
      return res.status(400).json({ success: false, message: 'Credits must be a positive integer.' });
    }

    if (isNaN(numSemester) || numSemester < 1 || numSemester > 12) {
      return res.status(400).json({ success: false, message: 'Semester must be between 1 and 12.' });
    }

    // Verify course exists
    const [existingCourse] = await db.query('SELECT course_id FROM courses WHERE course_id = ?', [courseId]);
    if (existingCourse.length === 0) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    // Check if new code clashes with another course
    const [codeClash] = await db.query(
      'SELECT course_id FROM courses WHERE course_code = ? AND course_id != ?',
      [trimmedCode, courseId]
    );
    if (codeClash.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Another course with code '${trimmedCode}' already exists.`
      });
    }

    await db.query(
      'UPDATE courses SET course_code = ?, course_name = ?, credits = ?, department = ?, semester = ?, description = ? WHERE course_id = ?',
      [trimmedCode, trimmedName, numCredits, trimmedDept, numSemester, courseDesc, courseId]
    );

    return res.json({
      success: true,
      message: `Course '${trimmedCode}' updated successfully!`,
      course: {
        course_id: courseId,
        course_code: trimmedCode,
        course_name: trimmedName,
        credits: numCredits,
        department: trimmedDept,
        semester: numSemester,
        description: courseDesc
      }
    });
  } catch (error) {
    console.error('Error updating course:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update course.'
    });
  }
});

/**
 * @route   DELETE /api/admin/courses/:id
 * @desc    Delete a course
 * @access  Private (Admin)
 */
router.delete('/courses/:id', async (req, res) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    if (isNaN(courseId)) {
      return res.status(400).json({ success: false, message: 'Invalid course ID.' });
    }

    // Find course first
    const [courses] = await db.query(
      'SELECT course_id, course_code, course_name FROM courses WHERE course_id = ?',
      [courseId]
    );
    if (courses.length === 0) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }
    const course = courses[0];

    // Check how many students are currently registered for this course
    const [[regCount]] = await db.query(
      'SELECT COUNT(*) AS total FROM registrations WHERE course_id = ?',
      [courseId]
    );

    // Cascaded delete via foreign key ON DELETE CASCADE will clean up registrations,
    // but inform the admin of the impact
    await db.query('DELETE FROM courses WHERE course_id = ?', [courseId]);

    return res.json({
      success: true,
      message: `Course '${course.course_code}: ${course.course_name}' was deleted successfully along with ${regCount.total} associated registration record(s).`
    });
  } catch (error) {
    console.error('Error deleting course:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete course due to a database constraint or server error.'
    });
  }
});

/**
 * @route   GET /api/admin/students
 * @desc    View all registered students
 * @access  Private (Admin)
 */
router.get('/students', async (req, res) => {
  try {
    const [students] = await db.query(
      `SELECT 
        s.student_id,
        s.name,
        s.roll_no,
        s.branch,
        s.email,
        s.created_at,
        COUNT(r.registration_id) AS registered_courses_count,
        COALESCE(SUM(c.credits), 0) AS total_credits
       FROM students s
       LEFT JOIN registrations r ON s.student_id = r.student_id
       LEFT JOIN courses c ON r.course_id = c.course_id
       GROUP BY s.student_id
       ORDER BY s.roll_no ASC`
    );

    return res.json({
      success: true,
      students
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve registered students.'
    });
  }
});

/**
 * @route   GET /api/admin/students/:id/registrations
 * @desc    View registration records for each student
 * @access  Private (Admin)
 */
router.get('/students/:id/registrations', async (req, res) => {
  try {
    const studentId = parseInt(req.params.id, 10);
    if (isNaN(studentId)) {
      return res.status(400).json({ success: false, message: 'Invalid student ID.' });
    }

    // Verify student
    const [students] = await db.query(
      'SELECT student_id, name, roll_no, branch, email FROM students WHERE student_id = ?',
      [studentId]
    );
    if (students.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const [registrations] = await db.query(
      `SELECT 
        r.registration_id,
        r.registration_date,
        r.status,
        c.course_id,
        c.course_code,
        c.course_name,
        c.credits,
        c.department,
        c.semester
       FROM registrations r
       JOIN courses c ON r.course_id = c.course_id
       WHERE r.student_id = ?
       ORDER BY r.registration_date DESC, c.course_code ASC`,
      [studentId]
    );

    return res.json({
      success: true,
      student: students[0],
      registrations
    });
  } catch (error) {
    console.error('Error fetching student registrations:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve student registration records.'
    });
  }
});

/**
 * @route   GET /api/admin/courses/:id/students
 * @desc    View the students registered for a particular course
 * @access  Private (Admin)
 */
router.get('/courses/:id/students', async (req, res) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    if (isNaN(courseId)) {
      return res.status(400).json({ success: false, message: 'Invalid course ID.' });
    }

    // Verify course
    const [courses] = await db.query(
      'SELECT course_id, course_code, course_name, credits, department, semester FROM courses WHERE course_id = ?',
      [courseId]
    );
    if (courses.length === 0) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    const [students] = await db.query(
      `SELECT 
        r.registration_id,
        r.registration_date,
        r.status,
        s.student_id,
        s.name,
        s.roll_no,
        s.branch,
        s.email
       FROM registrations r
       JOIN students s ON r.student_id = s.student_id
       WHERE r.course_id = ?
       ORDER BY s.roll_no ASC`,
      [courseId]
    );

    return res.json({
      success: true,
      course: courses[0],
      totalStudents: students.length,
      students
    });
  } catch (error) {
    console.error('Error fetching students registered for course:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve registered students for this course.'
    });
  }
});

/**
 * @route   GET /api/admin/registrations
 * @desc    View all registration records across the institution
 * @access  Private (Admin)
 */
router.get('/registrations', async (req, res) => {
  try {
    const { status, course_id, student_id } = req.query;

    let query = `
      SELECT 
        r.registration_id,
        r.registration_date,
        r.status,
        r.created_at,
        s.student_id,
        s.name AS student_name,
        s.roll_no,
        s.branch,
        s.email,
        c.course_id,
        c.course_code,
        c.course_name,
        c.credits,
        c.department,
        c.semester
      FROM registrations r
      JOIN students s ON r.student_id = s.student_id
      JOIN courses c ON r.course_id = c.course_id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      query += ' AND r.status = ?';
      params.push(status);
    }

    if (course_id && course_id !== 'all') {
      query += ' AND r.course_id = ?';
      params.push(parseInt(course_id, 10));
    }

    if (student_id && student_id !== 'all') {
      query += ' AND r.student_id = ?';
      params.push(parseInt(student_id, 10));
    }

    query += ' ORDER BY r.registration_id DESC';

    const [registrations] = await db.query(query, params);

    return res.json({
      success: true,
      registrations
    });
  } catch (error) {
    console.error('Error fetching all registrations:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve registrations list.'
    });
  }
});

/**
 * @route   PATCH /api/admin/registrations/:id/status
 * @desc    Update a registration status (e.g. Registered, Approved, Dropped, Completed)
 * @access  Private (Admin)
 */
router.patch('/registrations/:id/status', async (req, res) => {
  try {
    const registrationId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (isNaN(registrationId)) {
      return res.status(400).json({ success: false, message: 'Invalid registration ID.' });
    }

    if (!status || !['Registered', 'Approved', 'Pending', 'Dropped', 'Completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be one of: 'Registered', 'Approved', 'Pending', 'Dropped', 'Completed'."
      });
    }

    const [existing] = await db.query('SELECT registration_id FROM registrations WHERE registration_id = ?', [registrationId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Registration record not found.' });
    }

    await db.query('UPDATE registrations SET status = ? WHERE registration_id = ?', [status, registrationId]);

    return res.json({
      success: true,
      message: `Registration #${registrationId} status updated to '${status}'.`
    });
  } catch (error) {
    console.error('Error updating registration status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update registration status.'
    });
  }
});

/**
 * @route   DELETE /api/admin/registrations/:id
 * @desc    Delete a registration record
 * @access  Private (Admin)
 */
router.delete('/registrations/:id', async (req, res) => {
  try {
    const registrationId = parseInt(req.params.id, 10);
    if (isNaN(registrationId)) {
      return res.status(400).json({ success: false, message: 'Invalid registration ID.' });
    }

    const [existing] = await db.query('SELECT registration_id FROM registrations WHERE registration_id = ?', [registrationId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Registration not found.' });
    }

    await db.query('DELETE FROM registrations WHERE registration_id = ?', [registrationId]);

    return res.json({
      success: true,
      message: 'Registration record deleted successfully.'
    });
  } catch (error) {
    console.error('Error deleting registration:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete registration record.'
    });
  }
});

module.exports = router;

