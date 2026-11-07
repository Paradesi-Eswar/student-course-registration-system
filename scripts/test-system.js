const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const PORT = 3001; // Use separate port for test server instance
process.env.PORT = PORT;

// Start server
const app = require('express')();
const session = require('express-session');
app.use(require('express').json());
app.use(require('express').urlencoded({ extended: true }));
app.use(
  session({
    secret: 'test_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  })
);
app.use('/api/auth', require('../routes/authRoutes'));
app.use('/api/student', require('../routes/studentRoutes'));
app.use('/api/admin', require('../routes/adminRoutes'));

let server;

function makeRequest(method, path, body = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (cookie) {
      options.headers['Cookie'] = cookie;
    }

    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let setCookie = res.headers['set-cookie'];
        let cookieHeader = null;
        if (setCookie) {
          cookieHeader = setCookie[0].split(';')[0];
        }
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed, cookie: cookieHeader });
        } catch {
          resolve({ status: res.statusCode, data, cookie: cookieHeader });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  server = app.listen(PORT, async () => {
    console.log(`Test server running on port ${PORT}...`);
    let passed = 0;
    let failed = 0;

    function assert(condition, testName, extra = '') {
      if (condition) {
        console.log(`✅ PASS: ${testName}`);
        passed++;
      } else {
        console.error(`❌ FAIL: ${testName} - ${extra}`);
        failed++;
      }
    }

    try {
      // 1. Student Registration
      const testRoll = 'TEST' + Math.floor(1000 + Math.random() * 9000);
      const testEmail = `test_${Date.now()}@college.edu`;
      const regRes = await makeRequest('POST', '/api/auth/student/register', {
        name: 'Test Student',
        roll_no: testRoll,
        branch: 'Computer Science',
        email: testEmail,
        password: 'password123'
      });
      assert(regRes.status === 201 && regRes.data.success, 'Student Registration', JSON.stringify(regRes.data));

      // 2. Duplicate Student Registration Prevention
      const dupRegRes = await makeRequest('POST', '/api/auth/student/register', {
        name: 'Another Student',
        roll_no: testRoll,
        branch: 'Mechanical',
        email: `another_${Date.now()}@college.edu`,
        password: 'password123'
      });
      assert(dupRegRes.status === 409 && !dupRegRes.data.success, 'Duplicate Roll Number Prevention', JSON.stringify(dupRegRes.data));

      // 3. Student Login
      const loginRes = await makeRequest('POST', '/api/auth/student/login', {
        roll_no: testRoll,
        password: 'password123'
      });
      assert(loginRes.status === 200 && loginRes.data.success, 'Student Login', JSON.stringify(loginRes.data));
      const studentCookie = loginRes.cookie;

      // 4. Student Profile
      const profRes = await makeRequest('GET', '/api/student/profile', null, studentCookie);
      assert(profRes.status === 200 && profRes.data.student.roll_no === testRoll, 'Get Student Profile', JSON.stringify(profRes.data));

      // 5. Get Available Courses
      const coursesRes = await makeRequest('GET', '/api/student/courses', null, studentCookie);
      assert(coursesRes.status === 200 && coursesRes.data.courses.length > 0, 'Get Available Courses', `Found ${coursesRes.data.courses?.length} courses`);
      const targetCourse = coursesRes.data.courses[0];

      // 6. Register Course
      const courseRegRes = await makeRequest('POST', '/api/student/register-course', {
        course_id: targetCourse.course_id
      }, studentCookie);
      assert(courseRegRes.status === 201 && courseRegRes.data.success, 'Register for Course', JSON.stringify(courseRegRes.data));
      const regId = courseRegRes.data.registration.registration_id;

      // 7. Prevent Duplicate Course Registration
      const dupCourseRegRes = await makeRequest('POST', '/api/student/register-course', {
        course_id: targetCourse.course_id
      }, studentCookie);
      assert(dupCourseRegRes.status === 409 && !dupCourseRegRes.data.success, 'Prevent Duplicate Course Registration', JSON.stringify(dupCourseRegRes.data));

      // 8. View My Registered Courses
      const myCoursesRes = await makeRequest('GET', '/api/student/my-courses', null, studentCookie);
      assert(myCoursesRes.status === 200 && myCoursesRes.data.courses.some(c => c.course_id === targetCourse.course_id), 'View My Registered Courses', JSON.stringify(myCoursesRes.data));

      // 9. Unauthorized Student Access to Admin API
      const unauthRes = await makeRequest('GET', '/api/admin/dashboard-stats', null, studentCookie);
      assert(unauthRes.status === 403, 'Prevent Student Access to Admin Functionalities', JSON.stringify(unauthRes.data));

      // 10. Admin Login
      const adminLoginRes = await makeRequest('POST', '/api/auth/admin/login', {
        username: 'admin',
        password: 'admin123'
      });
      assert(adminLoginRes.status === 200 && adminLoginRes.data.success, 'Admin Login', JSON.stringify(adminLoginRes.data));
      const adminCookie = adminLoginRes.cookie;

      // 11. Admin Dashboard Stats
      const adminStatsRes = await makeRequest('GET', '/api/admin/dashboard-stats', null, adminCookie);
      assert(adminStatsRes.status === 200 && adminStatsRes.data.stats.total_courses > 0, 'Admin Dashboard Stats', JSON.stringify(adminStatsRes.data));

      // 12. Admin Add Course
      const newCourseCode = 'TEST' + Math.floor(100 + Math.random() * 900);
      const addCourseRes = await makeRequest('POST', '/api/admin/courses', {
        course_code: newCourseCode,
        course_name: 'Test Engineering Lab',
        credits: 3,
        department: 'Computer Science',
        semester: 4,
        description: 'Automated test created course.'
      }, adminCookie);
      assert(addCourseRes.status === 201 && addCourseRes.data.success, 'Admin Add Course', JSON.stringify(addCourseRes.data));
      const createdCourseId = addCourseRes.data.course.course_id;

      // 13. Admin Update Course
      const updateCourseRes = await makeRequest('PUT', `/api/admin/courses/${createdCourseId}`, {
        course_code: newCourseCode,
        course_name: 'Updated Test Engineering Lab',
        credits: 4,
        department: 'Computer Science',
        semester: 4,
        description: 'Updated syllabus details.'
      }, adminCookie);
      assert(updateCourseRes.status === 200 && updateCourseRes.data.course.credits === 4, 'Admin Update Course', JSON.stringify(updateCourseRes.data));

      // 14. Admin View All Students
      const adminStudentsRes = await makeRequest('GET', '/api/admin/students', null, adminCookie);
      assert(adminStudentsRes.status === 200 && adminStudentsRes.data.students.length > 0, 'Admin View All Students', `Count: ${adminStudentsRes.data.students?.length}`);

      // 15. Admin View Registration Records for a Particular Student
      const studentId = profRes.data.student.student_id;
      const studentRegsRes = await makeRequest('GET', `/api/admin/students/${studentId}/registrations`, null, adminCookie);
      assert(studentRegsRes.status === 200 && studentRegsRes.data.registrations.length > 0, 'Admin View Registrations for a Student', `Count: ${studentRegsRes.data.registrations?.length}`);

      // 16. Admin View Students Registered for a Particular Course
      const courseStudentsRes = await makeRequest('GET', `/api/admin/courses/${targetCourse.course_id}/students`, null, adminCookie);
      assert(courseStudentsRes.status === 200 && courseStudentsRes.data.students.length > 0, 'Admin View Students Registered for Course', `Count: ${courseStudentsRes.data.students?.length}`);

      // 17. Admin View All Registrations
      const allRegsRes = await makeRequest('GET', '/api/admin/registrations', null, adminCookie);
      assert(allRegsRes.status === 200 && allRegsRes.data.registrations.length > 0, 'Admin View All Registrations', `Count: ${allRegsRes.data.registrations?.length}`);

      // 18. Admin Update Registration Status
      const statusUpdateRes = await makeRequest('PATCH', `/api/admin/registrations/${regId}/status`, {
        status: 'Approved'
      }, adminCookie);
      assert(statusUpdateRes.status === 200 && statusUpdateRes.data.success, 'Admin Update Registration Status', JSON.stringify(statusUpdateRes.data));

      // 19. Student Drop Course
      const dropRes = await makeRequest('DELETE', `/api/student/drop-course/${regId}`, null, studentCookie);
      assert(dropRes.status === 200 && dropRes.data.success, 'Student Drop Course', JSON.stringify(dropRes.data));

      // 20. Admin Delete Course
      const deleteCourseRes = await makeRequest('DELETE', `/api/admin/courses/${createdCourseId}`, null, adminCookie);
      assert(deleteCourseRes.status === 200 && deleteCourseRes.data.success, 'Admin Delete Course', JSON.stringify(deleteCourseRes.data));

      console.log(`\n========================================`);
      console.log(`Test Execution Summary: ${passed} Passed, ${failed} Failed`);
      console.log(`========================================`);
    } catch (err) {
      console.error('Test error:', err);
    } finally {
      server.close(() => {
        process.exit(failed > 0 ? 1 : 0);
      });
    }
  });
}

runTests();

