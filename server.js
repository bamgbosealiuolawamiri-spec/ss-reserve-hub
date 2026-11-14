const express = require("express");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USERNAME;
const ADMIN_PASS = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const DATA_FILE = path.join(__dirname, "data.json");
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!SESSION_SECRET) console.warn("SESSION_SECRET is not configured.");
if (!ADMIN_USER || !ADMIN_PASS) console.warn("Admin login is disabled until ADMIN_USERNAME and ADMIN_PASSWORD are configured.");

const seed = {
  settings: {
    announcement: "Complimentary Lagos delivery on demo orders over ₦30,000",
    heroEyebrow: "THE GOOD DRINKS EDIT",
    heroTitle: "Make every moment a little more refreshing.",
    heroText: "Discover sparkling favourites, bright juices and everyday essentials — all in one place.",
    heroImage: "",
    heroVideo: "",
    currency: "NGN"
  },
  categories: ["Sparkling", "Juices", "Water", "Mixers", "Energy & Malt"],
  products: [
    { id:"p1", name:"Citrus Sparkling", category:"Sparkling", price:1800, description:"Bright citrus flavour with a lively sparkle.", image:"", badge:"Bestseller", stock:24 },
    { id:"p2", name:"Tropical Fruit Blend", category:"Juices", price:2500, description:"A sunny fruit blend for everyday refreshment.", image:"", badge:"Popular", stock:18 },
    { id:"p3", name:"Still Mineral Water", category:"Water", price:900, description:"Crisp, clean hydration for any occasion.", image:"", badge:"Essential", stock:50 },
    { id:"p4", name:"Ginger Lime Mixer", category:"Mixers", price:2200, description:"A zesty non-alcoholic mixer for creative mocktails.", image:"", badge:"New", stock:16 },
    { id:"p5", name:"Classic Malt", category:"Energy & Malt", price:1600, description:"A rich, malt-forward non-alcoholic refreshment.", image:"", badge:"", stock:30 },
    { id:"p6", name:"Berry Fizz", category:"Sparkling", price:2000, description:"A refreshing berry-inspired sparkling drink.", image:"", badge:"", stock:20 }
  ],
  orders: []
};

function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return structuredClone(seed); }
}
let data = loadData();
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function requireAdmin(req, res, next) {
  if (req.session && req.session.admin === true) return next();
  return res.status(401).json({ error: "Admin sign-in required." });
}

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(session({
  name: "ssrh.sid",
  secret: SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 }
}));
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomBytes(12).toString("hex") + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 35 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime))$/.test(file.mimetype);
    cb(ok ? null : new Error("Only image and video files are allowed."), ok);
  }
});

app.get("/api/store", (_req, res) => res.json({ settings: data.settings, categories: data.categories, products: data.products }));
app.get("/api/admin/status", (req, res) => res.json({ configured: Boolean(ADMIN_USER && ADMIN_PASS && SESSION_SECRET), authenticated: req.session.admin === true }));
app.post("/api/admin/login", (req, res) => {
  if (!ADMIN_USER || !ADMIN_PASS || !SESSION_SECRET) return res.status(503).json({ error: "Admin access is not configured yet. Add the required Render environment variables." });
  const { username, password } = req.body || {};
  const userOK = typeof username === "string" && crypto.timingSafeEqual(Buffer.from(username.padEnd(256).slice(0,256)), Buffer.from(ADMIN_USER.padEnd(256).slice(0,256)));
  const passOK = typeof password === "string" && crypto.timingSafeEqual(Buffer.from(password.padEnd(256).slice(0,256)), Buffer.from(ADMIN_PASS.padEnd(256).slice(0,256)));
  if (!userOK || !passOK) return res.status(401).json({ error: "Those sign-in details don't match." });
  req.session.admin = true;
  res.json({ ok: true });
});
app.post("/api/admin/logout", requireAdmin, (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/admin/data", requireAdmin, (_req, res) => res.json(data));
app.put("/api/admin/settings", requireAdmin, (req, res) => {
  const allowed = ["announcement","heroEyebrow","heroTitle","heroText","heroImage","heroVideo"];
  for (const key of allowed) if (typeof req.body[key] === "string") data.settings[key] = req.body[key].slice(0, 2000);
  saveData(); res.json({ ok: true, settings: data.settings });
});
app.post("/api/admin/products", requireAdmin, (req, res) => {
  const p = req.body || {};
  if (!p.name || !p.category || !Number.isFinite(Number(p.price))) return res.status(400).json({ error: "Enter a product name, category and valid price." });
  const product = { id: crypto.randomUUID(), name:String(p.name).slice(0,100), category:String(p.category).slice(0,60), price:Math.max(0,Number(p.price)), description:String(p.description || "").slice(0,500), image:String(p.image || ""), badge:String(p.badge || "").slice(0,30), stock:Math.max(0,Number(p.stock || 0)) };
  data.products.unshift(product); saveData(); res.json(product);
});
app.put("/api/admin/products/:id", requireAdmin, (req, res) => {
  const p = data.products.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "Product not found." });
  for (const key of ["name","category","description","image","badge"]) if (typeof req.body[key] === "string") p[key] = req.body[key].slice(0,2000);
  if (req.body.price !== undefined) p.price = Math.max(0, Number(req.body.price) || 0);
  if (req.body.stock !== undefined) p.stock = Math.max(0, Number(req.body.stock) || 0);
  saveData(); res.json(p);
});
app.delete("/api/admin/products/:id", requireAdmin, (req, res) => {
  data.products = data.products.filter(x => x.id !== req.params.id); saveData(); res.json({ ok:true });
});
app.post("/api/admin/upload", requireAdmin, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose an image or video first." });
  res.json({ url: "/uploads/" + req.file.filename, type: req.file.mimetype });
});
app.post("/api/demo-order", (req, res) => {
  const { items, name, email, phone, address } = req.body || {};
  if (!Array.isArray(items) || !items.length || !name || !email) return res.status(400).json({ error: "Please add items and complete the demo contact fields." });
  const lines = items.map(i => {
    const p = data.products.find(x => x.id === i.id);
    if (!p) return null;
    const quantity = Math.max(1, Math.min(20, Number(i.quantity) || 1));
    return { id:p.id, name:p.name, price:p.price, quantity };
  }).filter(Boolean);
  if (!lines.length) return res.status(400).json({ error: "Your bag is empty." });
  const order = { id:"DEMO-" + Date.now().toString().slice(-8), name:String(name).slice(0,100), email:String(email).slice(0,150), phone:String(phone || "").slice(0,40), address:String(address || "").slice(0,300), items:lines, total:lines.reduce((s,i)=>s+i.price*i.quantity,0), status:"Demo received", createdAt:new Date().toISOString() };
  data.orders.unshift(order); saveData();
  res.json({ ok:true, orderId:order.id, total:order.total, note:"Demo only — no payment was taken and no real delivery was arranged." });
});
app.get("/api/admin/orders", requireAdmin, (_req,res) => res.json(data.orders));
app.patch("/api/admin/orders/:id", requireAdmin, (req,res) => {
  const order = data.orders.find(x=>x.id===req.params.id);
  if (!order) return res.status(404).json({error:"Order not found."});
  const allowed = ["Demo received","Being prepared (demo)","Completed (demo)","Cancelled (demo)"];
  if (allowed.includes(req.body.status)) order.status = req.body.status;
  saveData(); res.json(order);
});
app.use(express.static(path.join(__dirname, "public")));
app.use((err,_req,res,_next) => res.status(400).json({error:err.message || "Request could not be completed."}));
app.listen(PORT, () => console.log("S&S Reserve Hub running on port " + PORT));
