const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true
};

const DB_NAME = process.env.DB_NAME || 'student_course_registration';

async function initDatabase() {
  let connection;
  try {
    console.log(`Connecting to MySQL server at ${dbConfig.host}:${dbConfig.port}...`);
    connection = await mysql.createConnection(dbConfig);

    console.log(`Creating database '${DB_NAME}' if not exists...`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await connection.query(`USE \`${DB_NAME}\`;`);

    console.log('Creating tables...');

    // 1. students
    await connection.query(`
      CREATE TABLE IF NOT EXISTS students (
        student_id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        roll_no VARCHAR(30) NOT NULL UNIQUE,
        branch VARCHAR(50) DEFAULT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // 2. courses
    await connection.query(`
      CREATE TABLE IF NOT EXISTS courses (
        course_id INT AUTO_INCREMENT PRIMARY KEY,
        course_code VARCHAR(20) NOT NULL UNIQUE,
        course_name VARCHAR(100) NOT NULL,
        credits INT NOT NULL,
        department VARCHAR(50) NOT NULL,
        semester INT NOT NULL,
        description TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // 3. registrations
    await connection.query(`
      CREATE TABLE IF NOT EXISTS registrations (
        registration_id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        course_id INT NOT NULL,
        registration_date DATE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Registered',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_registration_student
          FOREIGN KEY (student_id) REFERENCES students(student_id)
          ON DELETE CASCADE
          ON UPDATE CASCADE,
        CONSTRAINT fk_registration_course
          FOREIGN KEY (course_id) REFERENCES courses(course_id)
          ON DELETE CASCADE
          ON UPDATE CASCADE,
        CONSTRAINT unique_student_course
          UNIQUE (student_id, course_id)
      ) ENGINE=InnoDB;
    `);

    // 4. admins
    await connection.query(`
      CREATE TABLE IF NOT EXISTS admins (
        admin_id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    console.log('Tables initialized successfully.');

    // Seed Admin
    const [existingAdmins] = await connection.query('SELECT * FROM admins WHERE username = ?', ['admin']);
    if (existingAdmins.length === 0) {
      const hashedAdminPassword = await bcrypt.hash('admin123', 10);
      await connection.query(
        'INSERT INTO admins (username, password, name, email) VALUES (?, ?, ?, ?)',
        ['admin', hashedAdminPassword, 'System Administrator', 'admin@college.edu']
      );
      console.log('Default admin seeded: username "admin", password "admin123"');
    }

    // Seed Courses
    const [existingCourses] = await connection.query('SELECT COUNT(*) as count FROM courses');
    if (existingCourses[0].count === 0) {
      const sampleCourses = [
        ['CS101', 'Introduction to Computer Science', 4, 'Computer Science', 1, 'Fundamental concepts of computer systems, algorithmic problem solving, and introduction to programming.'],
        ['CS201', 'Data Structures and Algorithms', 4, 'Computer Science', 3, 'Comprehensive study of arrays, linked lists, stacks, queues, trees, graphs, sorting, and asymptotic analysis.'],
        ['CS301', 'Database Management Systems', 3, 'Computer Science', 5, 'Relational models, SQL, normalization, transaction management, indexing, and storage engines.'],
        ['CS401', 'Operating Systems', 4, 'Computer Science', 5, 'Process management, concurrency, deadlocks, memory virtualization, storage systems, and file structures.'],
        ['EC101', 'Basic Electronics Engineering', 3, 'Electronics', 1, 'Semiconductor physics, diodes, transistors, amplifiers, operational amplifiers, and digital logic fundamentals.'],
        ['EC202', 'Digital Signal Processing', 4, 'Electronics', 4, 'Discrete-time signals and systems, Z-transform, DFT/FFT, FIR/IIR filter design, and spectral analysis.'],
        ['ME101', 'Engineering Mechanics', 3, 'Mechanical', 1, 'Statics, dynamics, friction, trusses, virtual work, moments of inertia, and kinematics of rigid bodies.'],
        ['MA201', 'Discrete Mathematics', 3, 'Mathematics', 3, 'Propositional logic, set theory, combinatorics, recurrence relations, graph theory, and algebraic structures.']
      ];

      for (const course of sampleCourses) {
        await connection.query(
          'INSERT INTO courses (course_code, course_name, credits, department, semester, description) VALUES (?, ?, ?, ?, ?, ?)',
          course
        );
      }
      console.log(`Seeded ${sampleCourses.length} sample courses.`);
    }

    // Seed Sample Student
    const [existingStudents] = await connection.query('SELECT * FROM students WHERE roll_no = ?', ['21CS001']);
    if (existingStudents.length === 0) {
      const hashedStudentPassword = await bcrypt.hash('student123', 10);
      const [studentResult] = await connection.query(
        'INSERT INTO students (name, roll_no, branch, email, password) VALUES (?, ?, ?, ?, ?)',
        ['John Doe', '21CS001', 'Computer Science', 'john@college.edu', hashedStudentPassword]
      );
      const studentId = studentResult.insertId;

      // Also create a second student for richer testing
      const [studentResult2] = await connection.query(
        'INSERT INTO students (name, roll_no, branch, email, password) VALUES (?, ?, ?, ?, ?)',
        ['Alice Smith', '21CS002', 'Computer Science', 'alice@college.edu', hashedStudentPassword]
      );
      const studentId2 = studentResult2.insertId;

      console.log('Default students seeded: roll_no "21CS001" and "21CS002", password "student123"');

      // Seed sample registrations
      const [courses] = await connection.query('SELECT course_id, course_code FROM courses LIMIT 3');
      if (courses.length >= 2) {
        const today = new Date().toISOString().split('T')[0];
        await connection.query(
          'INSERT INTO registrations (student_id, course_id, registration_date, status) VALUES (?, ?, ?, ?)',
          [studentId, courses[0].course_id, today, 'Registered']
        );
        await connection.query(
          'INSERT INTO registrations (student_id, course_id, registration_date, status) VALUES (?, ?, ?, ?)',
          [studentId, courses[1].course_id, today, 'Approved']
        );
        await connection.query(
          'INSERT INTO registrations (student_id, course_id, registration_date, status) VALUES (?, ?, ?, ?)',
          [studentId2, courses[0].course_id, today, 'Approved']
        );
        console.log('Sample course registrations seeded.');
      }
    }

    console.log('Database initialization completed successfully!');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initDatabase();

