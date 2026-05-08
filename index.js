const express = require("express");
const session = require("express-session");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = 3000;

app.set("view engine", "ejs");

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(session({
  secret: "mastery-secret",
  resave: false,
  saveUninitialized: true
}));

/* ---------------- DATABASE ---------------- */

const users = [
  {
    id: 1,
    name: "Miguel",
    email: "student@csh.edu",
    password: "student",
    role: "student"
  },
  {
    id: 2,
    name: "Ms. Liani",
    email: "teacher@csh.edu",
    password: "teacher",
    role: "teacher"
  }
];

let assignments = [
  {
    id: uuidv4(),
    title: "Math Mastery #3",
    due: "Tomorrow",
    subject: "Math",
    status: "soon",
    studentEmail: "student@csh.edu"
  },
  {
    id: uuidv4(),
    title: "History Essay",
    due: "Missing",
    subject: "History",
    status: "missing",
    studentEmail: "student@csh.edu"
  },
  {
    id: uuidv4(),
    title: "Science Lab",
    due: "Completed",
    subject: "Science",
    status: "done",
    studentEmail: "student@csh.edu"
  }
];

/* ---------------- HELPERS ---------------- */

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/");
  }
  next();
}

/* ---------------- ROUTES ---------------- */

app.get("/", (req, res) => {
  res.render("login", { error: null });
});

/* LOGIN */
app.post("/login", (req, res) => {

  const { email, password, role } = req.body;

  const user = users.find(u =>
    u.email === email &&
    u.password === password &&
    u.role === role
  );

  if (!user) {
    return res.render("login", {
      error: "Invalid login credentials"
    });
  }

  req.session.user = user;

  if (user.role === "student") {
    return res.redirect("/student");
  }

  res.redirect("/teacher");
});

/* LOGOUT */
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

/* STUDENT */
app.get("/student", requireLogin, (req, res) => {

  const user = req.session.user;

  const studentAssignments = assignments.filter(
    a => a.studentEmail === user.email
  );

  const completed = studentAssignments.filter(
    a => a.status === "done"
  ).length;

  const progressPercent =
    Math.round((completed / studentAssignments.length) * 100) || 0;

  const priorityTask = studentAssignments.find(
    a => a.status !== "done"
  );

  res.render("student", {
    user,
    assignments: studentAssignments,
    progressPercent,
    priorityTask,
    streakDays: 4
  });
});

/* COMPLETE ASSIGNMENT */
app.post("/student/assignments/:id/complete", requireLogin, (req, res) => {

  const assignment = assignments.find(
    a => a.id === req.params.id
  );

  if (assignment) {
    assignment.status = "done";
    assignment.due = "Completed";
  }

  res.redirect("/student");
});

/* TEACHER */
app.get("/teacher", requireLogin, (req, res) => {

  const students = users.filter(
    u => u.role === "student"
  );

  const studentSummaries = students.map(student => {

    const studentAssignments = assignments.filter(
      a => a.studentEmail === student.email
    );

    const completed = studentAssignments.filter(
      a => a.status === "done"
    ).length;

    const progress =
      Math.round((completed / studentAssignments.length) * 100) || 0;

    return {
      name: student.name,
      progress,
      status: progress >= 70 ? "On Track" : "At Risk"
    };
  });

  res.render("teacher", {
    students,
    studentSummaries,
    assignments
  });
});

/* CREATE ASSIGNMENT */
app.post("/teacher/assignments", requireLogin, (req, res) => {

  const { title, due, subject, studentEmail } = req.body;

  assignments.push({
    id: uuidv4(),
    title,
    due,
    subject,
    status: "soon",
    studentEmail
  });

  res.redirect("/teacher");
});

/* START */
app.listen(PORT, () => {
  console.log(`Running on http://localhost:${PORT}`);
});