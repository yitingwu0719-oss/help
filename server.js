const express = require("express");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

// Multer 檔案儲存設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "public/uploads/";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage: storage });

// 啟用 JSON & CORS
app.use(express.json());
app.use(cors());
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// 建立資料庫
const db = new sqlite3.Database("shop.db");

// 將 db.run 封裝成 Promise
const dbRun = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

// 將 db.get 封裝成 Promise
const dbGet = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT, price REAL, image TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, customerName TEXT, customerAddress TEXT, customerEmail TEXT, customerPhone TEXT, paymentMethod TEXT, status TEXT, createdAt TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY, orderId INTEGER, productId INTEGER, quantity INTEGER, price REAL, FOREIGN KEY(orderId) REFERENCES orders(id), FOREIGN KEY(productId) REFERENCES products(id))");
});

// ============ 商品相關 API ============

// 商品新增
app.post("/products", upload.single("image"), async (req, res) => {
  const { name, price } = req.body;
  if (!name || !price || !req.file) {
    return res.status(400).json({ error: "名稱、價格和圖片為必填" });
  }
  const image = req.file.path.replace(/\\/g, "/").split("public/")[1];
  try {
    const result = await dbRun("INSERT INTO products (name, price, image) VALUES (?, ?, ?)", [name, price, image]);
    res.status(201).json({ id: result.lastID, name, price, image });
  } catch (err) {
    console.error("商品新增失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

// 商品修改
app.put("/products/:id", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const { name, price } = req.body;
  try {
    const product = await dbGet("SELECT * FROM products WHERE id = ?", [id]);
    if (!product) return res.status(404).json({ error: "商品不存在" });
    const updatedName = name || product.name;
    const updatedPrice = price || product.price;
    let updatedImage = product.image;
    if (req.file) {
      updatedImage = req.file.path.replace(/\\/g, "/").split("public/")[1];
      const oldImagePath = path.join(__dirname, "public", product.image);
      fs.unlink(oldImagePath, err => {
        if (err) console.error("刪除舊圖片失敗:", err);
      });
    }
    const result = await dbRun("UPDATE products SET name = ?, price = ?, image = ? WHERE id = ?", [updatedName, updatedPrice, updatedImage, id]);
    res.json({ id, name: updatedName, price: updatedPrice, image: updatedImage });
  } catch (err) {
    console.error("商品修改失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

// 商品刪除
app.delete("/products/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const product = await dbGet("SELECT image FROM products WHERE id = ?", [id]);
    if (!product) return res.status(404).json({ error: "商品不存在" });
    const result = await dbRun("DELETE FROM products WHERE id = ?", [id]);
    const imagePath = path.join(__dirname, "public", product.image);
    fs.unlink(imagePath, err => {
      if (err) console.error("刪除圖片失敗:", err);
    });
    res.json({ deleted: result.changes });
  } catch (err) {
    console.error("商品刪除失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

// 取得所有商品
app.get("/products", async (req, res) => {
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all("SELECT * FROM products", [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    res.json(rows);
  } catch (err) {
    console.error("取得所有商品失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

// 取得單一商品
app.get("/products/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const row = await dbGet("SELECT * FROM products WHERE id = ?", [id]);
    if (!row) return res.status(404).json({ error: "商品不存在" });
    res.json(row);
  } catch (err) {
    console.error("取得單一商品失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

// 新增訂單（購物車送單用）
async function rollbackTransaction() {
  try {
    await dbRun("ROLLBACK");
  } catch (e) {
    console.error("回滾失敗", e);
  }
}

app.post("/orders", async (req, res) => {
  const { customer, items } = req.body;

  if (!customer || !items || items.length === 0) {
    return res.status(400).json({ error: "訂單資料不完整" });
  }

  try {
    await dbRun("BEGIN TRANSACTION");

    const createdAt = new Date().toISOString();

const orderResult = await dbRun(
  `INSERT INTO orders 
   (customerName, customerAddress, customerEmail, customerPhone, paymentMethod, size, status, createdAt)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    customer.name,
    customer.address,
    customer.email,
    customer.phone,
    customer.paymentMethod || "未指定",
    customer.size || "未選擇",  // 新增尺寸
    "待處理",
    createdAt
  ]
);
    const orderId = orderResult.lastID;

    for (const item of items) {
      await dbRun(
        "INSERT INTO order_items (orderId, productId, quantity, price) VALUES (?, ?, ?, ?)",
        [orderId, item.productId, item.quantity, item.price || 0]  // price 可直接傳前端資料
      );
    }

    await dbRun("COMMIT");
    res.status(201).json({ message: "訂單建立成功", orderId });
  } catch (err) {
    await dbRun("ROLLBACK").catch(e => console.error("回滾失敗:", e));
    res.status(500).json({ error: err.message });
  }
});
// 取得所有訂單
app.get("/orders", async (req, res) => {
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all("SELECT * FROM orders", [], (err, rows) => {
        if (err) reject(err); 
        else resolve(rows);
      });
    });
    res.json(rows);
  } catch (err) {
    console.error("取得所有訂單失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

// 取得單一訂單 (包含訂單項目)
app.get("/orders/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const order = await dbGet("SELECT * FROM orders WHERE id = ?", [id]);
    if (!order) return res.status(404).json({ error: "訂單不存在" });
    const items = await new Promise((resolve, reject) => {
      db.all("SELECT * FROM order_items WHERE orderId = ?", [id], (err, items) => {
        if (err) reject(err);
        else resolve(items);
      });
    });
    res.json({ ...order, items });
  } catch (err) {
    console.error("取得單一訂單失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

// 更新訂單狀態
app.put("/orders/:id", async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "狀態為必填" });
  try {
    const result = await dbRun("UPDATE orders SET status = ? WHERE id = ?", [status, req.params.id]);
    if (result.changes === 0) return res.status(404).json({ error: "訂單不存在" });
    res.json({ message: "訂單狀態已更新", updated: result.changes });
  } catch (err) {
    console.error("更新訂單狀態失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

// 訂單刪除 API
app.delete("/orders/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await dbRun("BEGIN TRANSACTION");
    const result1 = await dbRun("DELETE FROM order_items WHERE orderId = ?", [id]);
    const result2 = await dbRun("DELETE FROM orders WHERE id = ?", [id]);
    if (result2.changes === 0) {
      await dbRun("ROLLBACK");
      return res.status(404).json({ error: "訂單不存在" });
    }
    await dbRun("COMMIT");
    res.json({ message: "訂單已成功刪除" });
  } catch (err) {
    await dbRun("ROLLBACK").catch(rollbackErr => console.error("回滾交易失敗:", rollbackErr));
    console.error("刪除訂單失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
