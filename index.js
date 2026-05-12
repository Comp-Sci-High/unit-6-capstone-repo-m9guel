const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

/* ─── FILE PATHS ─────────────────────────────────────────── */

const USERS_FILE  = path.join(__dirname, "data", "users.json");
const TOKENS_FILE = path.join(__dirname, "data", "reset-tokens.json");

/* ─── DB HELPERS ─────────────────────────────────────────── */

function readUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function readTokens() {
  return JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8"));
}

function writeTokens(tokens) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

/* ─── MIDDLEWARE ─────────────────────────────────────────── */

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(session({
  secret: "csh-super-secret-key-change-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24 hours
}));

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect("/login");
  next();
}

function redirectIfLoggedIn(req, res, next) {
  if (req.session.userId) return res.redirect("/dashboard");
  next();
}

/* ─── VALIDATION HELPERS ─────────────────────────────────── */

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ─── ROUTES ─────────────────────────────────────────────── */

// Root — redirect based on login state
app.get("/", (req, res) => {
  res.redirect(req.session.userId ? "/dashboard" : "/login");
});

/* ── LOGIN ── */
app.get("/login", redirectIfLoggedIn, (req, res) => {
  res.render("login", { error: null, email: "" });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.render("login", {
      error: "Please fill in all fields.",
      email: email || ""
    });
  }

  if (!isValidEmail(email)) {
    return res.render("login", {
      error: "Please enter a valid email address.",
      email
    });
  }

  const users = readUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.render("login", {
      error: "Incorrect email or password.",
      email
    });
  }

  req.session.userId = user.id;
  req.session.userName = user.name;
  res.redirect("/dashboard");
});

/* ── SIGN UP ── */
app.get("/signup", redirectIfLoggedIn, (req, res) => {
  res.render("signup", { error: null, values: {} });
});

app.post("/signup", async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;
  const values = { name, email };

  if (!name || !email || !password || !confirmPassword) {
    return res.render("signup", { error: "Please fill in all fields.", values });
  }

  if (name.trim().length < 2) {
    return res.render("signup", { error: "Please enter your full name.", values });
  }

  if (!isValidEmail(email)) {
    return res.render("signup", { error: "Please enter a valid email address.", values });
  }

  if (password.length < 8) {
    return res.render("signup", { error: "Password must be at least 8 characters.", values });
  }

  if (password !== confirmPassword) {
    return res.render("signup", { error: "Passwords do not match.", values });
  }

  const users = readUsers();
  const exists = users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (exists) {
    return res.render("signup", {
      error: "An account with this email already exists.",
      values
    });
  }

  const hashed = await bcrypt.hash(password, 12);
  const newUser = {
    id: uuidv4(),
    name: name.trim(),
    email: email.toLowerCase(),
    password: hashed,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeUsers(users);

  req.session.userId = newUser.id;
  req.session.userName = newUser.name;
  res.redirect("/dashboard");
});

/* ── FORGOT PASSWORD ── */
app.get("/forgot-password", redirectIfLoggedIn, (req, res) => {
  res.render("forgot-password", { error: null, success: null, email: "" });
});

app.post("/forgot-password", (req, res) => {
  const { email } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.render("forgot-password", {
      error: "Please enter a valid email address.",
      success: null,
      email: email || ""
    });
  }

  const users = readUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

  // Always show success (don't reveal whether email exists — security best practice)
  if (user) {
    const token = uuidv4();
    const expiry = Date.now() + 1000 * 60 * 60; // 1 hour

    const tokens = readTokens().filter(t => t.email !== user.email); // remove old tokens
    tokens.push({ token, email: user.email, expiry });
    writeTokens(tokens);

    // In production you'd send an email here with nodemailer.
    // For now the reset link is logged to the console so you can test it.
    console.log(`\n🔑 PASSWORD RESET LINK (dev only):`);
    console.log(`   http://localhost:${PORT}/reset-password/${token}\n`);
  }

  res.render("forgot-password", {
    error: null,
    success: "If that email is registered, a reset link has been sent. Check your console in dev mode.",
    email
  });
});

/* ── RESET PASSWORD ── */
app.get("/reset-password/:token", (req, res) => {
  const tokens = readTokens();
  const entry = tokens.find(
    t => t.token === req.params.token && t.expiry > Date.now()
  );

  if (!entry) {
    return res.render("reset-password", {
      error: "This reset link is invalid or has expired.",
      token: null,
      success: null
    });
  }

  res.render("reset-password", { error: null, token: req.params.token, success: null });
});

app.post("/reset-password/:token", async (req, res) => {
  const { password, confirmPassword } = req.body;
  const tokens = readTokens();
  const entry = tokens.find(
    t => t.token === req.params.token && t.expiry > Date.now()
  );

  if (!entry) {
    return res.render("reset-password", {
      error: "This reset link is invalid or has expired.",
      token: null,
      success: null
    });
  }

  if (!password || password.length < 8) {
    return res.render("reset-password", {
      error: "Password must be at least 8 characters.",
      token: req.params.token,
      success: null
    });
  }

  if (password !== confirmPassword) {
    return res.render("reset-password", {
      error: "Passwords do not match.",
      token: req.params.token,
      success: null
    });
  }

  const users = readUsers();
  const userIndex = users.findIndex(u => u.email === entry.email);

  if (userIndex === -1) {
    return res.render("reset-password", {
      error: "Account not found.",
      token: null,
      success: null
    });
  }

  users[userIndex].password = await bcrypt.hash(password, 12);
  writeUsers(users);

  // Remove used token
  writeTokens(tokens.filter(t => t.token !== req.params.token));

  res.render("reset-password", {
    error: null,
    token: null,
    success: "Your password has been reset. You can now log in."
  });
});

/* ── DASHBOARD ── */
app.get("/dashboard", requireLogin, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.session.userId);
  if (!user) {
    req.session.destroy();
    return res.redirect("/login");
  }
  res.render("dashboard", { user });
});

/* ── LOGOUT ── */
app.get("/login", redirectIfLoggedIn, (req, res) => {
  res.render("login", { error: null, email: "" });
});

/* ─── START ──────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`Running on http://localhost:${PORT}`);
});