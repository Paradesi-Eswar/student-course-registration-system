-- ====================================================================
-- Database Schema for Student Course Registration System
-- Database Name: student_course_registration
-- ====================================================================

CREATE DATABASE IF NOT EXISTS student_course_registration
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE student_course_registration;

-- --------------------------------------------------------------------
-- Note on Schema Extensions:
-- As required by the project specifications:
-- 1. `password` column is included in the `students` table to support
--    secure student registration and login with bcrypt hashing.
-- 2. An `admins` table is introduced to securely store and authenticate
--    system administrators separately from students, satisfying the
--    requirement to "restrict administrative operations to authenticated administrators".
-- --------------------------------------------------------------------

-- ====================================================================
-- Table 1: students
-- ====================================================================
CREATE TABLE IF NOT EXISTS students (
    student_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    roll_no VARCHAR(30) NOT NULL UNIQUE,
    branch VARCHAR(50) DEFAULT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL COMMENT 'Bcrypt-hashed password for authentication',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ====================================================================
-- Table 2: courses
-- ====================================================================
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

-- ====================================================================
-- Table 3: registrations
-- ====================================================================
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

-- ====================================================================
-- Auxiliary Table: admins (for secure Administrator authentication)
-- ====================================================================
CREATE TABLE IF NOT EXISTS admins (
    admin_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL COMMENT 'Bcrypt-hashed password for authentication',
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

