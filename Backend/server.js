console.log("DEPLOY MARKER:", new Date().toISOString());

// --- Imports ---
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");

// --- App init ---
const app = express();
console.log("Loaded server.js from:", __dirname);
console.log("=== Booting Trade-Ur-Skills server ===");
console.log("CWD:", process.cwd());
console.log("DIRNAME:", __dirname);
console.log("Using DB at:", process.env.DB_PATH || "./skills.db");

// --- Middleware ---
app.use(cors());
app.use(bodyParser.json());

// Request logger (helps debugging)
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`);
  next();
});

// --- Database setup ---
const DB_PATH = process.env.DB_PATH || "./skills.db";
const db = new sqlite3.Database(DB_PATH);


// --- Helpers ---
function getUserIdByUsername(username, cb) {
  db.get("SELECT id FROM users WHERE username = ?", [username], (err, row) => {
    if (err) return cb(err);
    if (!row) return cb(new Error("User not found"));
    cb(null, row.id);
  });
}

// =============== AUTH ROUTES ===============
app.post("/signup", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send("Missing fields");
  const hashed = bcrypt.hashSync(password, 10);
  db.run(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, hashed],
    function (err) {
      if (err) {
        if (String(err).includes("UNIQUE"))
          return res.status(409).send("Username already exists");
        return res.status(500).send("Error signing up");
      }
      res.send({ id: this.lastID, username });
    }
  );
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send("Missing fields");
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
    if (err) return res.status(500).send("Error logging in");
    if (!row) return res.status(401).send("Invalid credentials");
    const ok = bcrypt.compareSync(password, row.password);
    if (!ok) return res.status(401).send("Invalid credentials");
    res.send({ id: row.id, username: row.username });
  });
});

// =============== SKILLS ROUTES ===============
app.post("/skills", (req, res) => {
  const { user_id, offer, want } = req.body;
  if (!user_id || !offer || !want)
    return res.status(400).send("Missing fields");
  db.run(
    "INSERT INTO skills (user_id, offer, want) VALUES (?, ?, ?)",
    [user_id, offer, want],
    function (err) {
      if (err) return res.status(500).send("Error adding skill");
      res.send({ id: this.lastID, user_id, offer, want });
    }
  );
});

app.get("/skills", (_req, res) => {
  db.all(
    `SELECT
       skills.id AS id,
       users.username AS username,
       skills.offer AS offer,
       skills.want AS want
     FROM skills
     JOIN users ON users.id = skills.user_id
     ORDER BY skills.id DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).send("Error fetching skills");
      res.send(rows);
    }
  );
});

app.delete("/skills/:id", (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM skills WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).send("Error deleting skill");
    if (this.changes === 0) return res.status(404).send("Skill not found");
    res.send({ success: true });
  });
});

app.put("/skills/:id", (req, res) => {
  const { id } = req.params;
  const { offer, want } = req.body;
  if (!offer || !want) return res.status(400).send("Missing fields");
  db.run(
    "UPDATE skills SET offer = ?, want = ? WHERE id = ?",
    [offer, want, id],
    function (err) {
      if (err) return res.status(500).send("Error updating skill");
      if (this.changes === 0) return res.status(404).send("Skill not found");
      res.send({ success: true, id: Number(id), offer, want });
    }
  );
});

// =============== MESSAGES ROUTES ===============
app.post("/messages", (req, res) => {
  const { from_user_id, to_username, body } = req.body;
  if (!from_user_id || !to_username || !body) {
    return res.status(400).send("Missing fields");
  }
  getUserIdByUsername(to_username, (err, to_id) => {
    if (err) return res.status(404).send("Recipient not found");
    db.run(
      "INSERT INTO messages (from_user_id, to_user_id, body) VALUES (?, ?, ?)",
      [from_user_id, to_id, body],
      function (e) {
        if (e) return res.status(500).send("Error sending message");
        res.send({
          id: this.lastID,
          from_user_id,
          to_user_id: to_id,
          body,
        });
      }
    );
  });
});

app.get("/messages", (req, res) => {
  const user_id = Number(req.query.user_id);
  if (!user_id) return res.status(400).send("user_id required");
  db.all(
    `SELECT
       m.id,
       uf.username AS from_username,
       ut.username AS to_username,
       m.body,
       m.created_at
     FROM messages m
     JOIN users uf ON uf.id = m.from_user_id
     JOIN users ut ON ut.id = m.to_user_id
     WHERE m.from_user_id = ? OR m.to_user_id = ?
     ORDER BY m.created_at DESC`,
    [user_id, user_id],
    (err, rows) => {
      if (err) return res.status(500).send("Error fetching messages");
      res.send(rows);
    }
  );
});

// =============== DEBUG ROUTES (optional) ===============
app.get("/debug/users", (_req, res) => {
  db.all("SELECT id, username FROM users", [], (err, rows) => {
    if (err) return res.status(500).send("DB error");
    res.send(rows);
  });
});

app.get("/debug/routes", (_req, res) => {
  const out = [];
  app._router.stack.forEach((layer) => {
    if (!layer.route) return;
    const methods = Object.keys(layer.route.methods)
      .filter(Boolean)
      .map((m) => m.toUpperCase())
      .join(",");
    out.push(`${methods} ${layer.route.path}`);
  });
  res.json(out);
});

// avoid favicon 404 noise
app.get("/favicon.ico", (_req, res) => res.status(204).end());

// --- Serve frontend ---
const PUBLIC_DIR = path.join(__dirname, "public");
console.log("Serving static from:", PUBLIC_DIR);

app.use(express.static(PUBLIC_DIR));
app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});


// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
