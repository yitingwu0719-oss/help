const express = require("express");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

// ================= Multer 檔案儲存設定 =================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "public/uploads/");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${Date.now()}-${name}${ext}`);
  }
});
const upload = multer({ storage });

// ================= JSON & CORS =================
app.use(express.json());
app.use(cors());
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// ================= 建立資料庫 & Promise 封裝 =================
const db = new sqlite3.Database("shop.db");
const dbRun = (query, params = []) => new Promise((resolve, reject) => {
  db.run(query, params, function(err) {
    if (err) reject(err); else resolve(this);
  });
});
const dbGet = (query, params = []) => new Promise((resolve, reject) => {
  db.get(query, params, (err, row) => err ? reject(err) : resolve(row));
});
const dbAll = (query, params = []) => new Promise((resolve, reject) => {
  db.all(query, params, (err, rows) => err ? reject(err) : resolve(rows));
});

// ================= 建表 (新增 category 欄位) =================
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    zhTitle TEXT,
    enTitle TEXT,
    zhPrice TEXT,
    enPrice TEXT,
    zhDesc TEXT,
    enDesc TEXT,
    link TEXT,
    image TEXT,
    images TEXT,
    category TEXT DEFAULT 'wood' -- 確保這裡有 category 欄位
  )`);
});

// **重要提醒：如果新增欄位後遇到錯誤，請刪除 shop.db 檔案後重啟伺服器。**

// ================= 商品 API =================

// 新增商品 (處理 category)
app.post("/products", upload.array("newImages"), async (req, res) => {
  try {
    const { zhTitle, enTitle, zhPrice, enPrice, zhDesc, enDesc, link, category } = req.body;
    
    // 設定預設類別，確保即使沒傳 category 也能運作
    const productCategory = category || 'wood'; 
    
    if (!zhTitle || !zhPrice || !zhDesc || !link) {
      return res.status(400).json({ error: "商品中文名稱、價格、描述與連結為必填" });
    }

    const files = req.files || [];
    const imagesArray = files.map(file => `/uploads/${file.filename}`);
    const mainImage = imagesArray[0] || null;

    const result = await dbRun(
      `INSERT INTO products 
        (zhTitle, enTitle, zhPrice, enPrice, zhDesc, enDesc, link, image, images, category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [zhTitle, enTitle, zhPrice, enPrice, zhDesc, enDesc, link, mainImage, JSON.stringify(imagesArray), productCategory]
    );

    res.status(201).json({
      id: result.lastID,
      zhTitle, enTitle, zhPrice, enPrice, zhDesc, enDesc, link,
      image: mainImage,
      images: imagesArray,
      category: productCategory
    });
  } catch (err) {
    console.error("新增商品失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

// 修改商品 (處理 category)
app.put("/products/:id", upload.array("newImages"), async (req, res) => {
  const { id } = req.params;
  const { zhTitle, enTitle, zhPrice, enPrice, zhDesc, enDesc, link, existingImages, category } = req.body;

  try {
    const product = await dbGet("SELECT * FROM products WHERE id = ?", [id]);
    if (!product) return res.status(404).json({ error: "商品不存在" });

    // 1. 解析並驗證保留的圖片
    let imagesArray = [];
    if (existingImages) {
      try {
        imagesArray = JSON.parse(existingImages).filter(img => typeof img === 'string' && img.startsWith('/uploads/'));
      } catch {
        imagesArray = [];
      }
    }

    // 2. 加入新上傳的圖片
    if (req.files && req.files.length > 0) {
      const newFiles = req.files.map(f => `/uploads/${f.filename}`);
      imagesArray = imagesArray.concat(newFiles);
    }
    
    const mainImage = imagesArray[0] || null;

    // 3. 更新資料庫
    await dbRun(
      `UPDATE products 
       SET zhTitle=?, enTitle=?, zhPrice=?, enPrice=?, zhDesc=?, enDesc=?, link=?, image=?, images=?, category=? 
       WHERE id=?`,
      [
        zhTitle || product.zhTitle,
        enTitle || product.enTitle,
        zhPrice || product.zhPrice,
        enPrice || product.enPrice,
        zhDesc || product.zhDesc,
        enDesc || product.enDesc,
        link || product.link,
        mainImage,
        JSON.stringify(imagesArray),
        category || product.category, // 使用新的 category 或保留舊的
        id
      ]
    );

    res.json({ message: "修改成功", images: imagesArray });
  } catch (err) {
    console.error("修改商品失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

// 刪除商品 (不變)
app.delete("/products/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const product = await dbGet("SELECT * FROM products WHERE id = ?", [id]);
    if (!product) return res.status(404).json({ error: "商品不存在" });

    if (product.images) {
      try {
        const imageList = JSON.parse(product.images);
        imageList.forEach(imgPath => {
          const fullPath = path.join(__dirname, "public", imgPath);
          if (fs.existsSync(fullPath)) fs.unlink(fullPath, (err) => { if (err) console.error("刪除檔案失敗:", err); });
        });
      } catch (err) {
        console.error("刪除多圖解析失敗:", err);
      }
    }

    await dbRun("DELETE FROM products WHERE id = ?", [id]);
    res.json({ message: "商品已刪除" });
  } catch (err) {
    console.error("刪除商品失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

// 取得所有商品 (不變)
app.get("/products", async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM products");
    const parsed = rows.map(r => ({ ...r, images: r.images ? JSON.parse(r.images) : [] }));
    res.json(parsed);
  } catch (err) {
    console.error("取得所有商品失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

// 取得單一商品 (不變)
app.get("/products/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const row = await dbGet("SELECT * FROM products WHERE id = ?", [id]);
    if (!row) return res.status(404).json({ error: "商品不存在" });
    row.images = row.images ? JSON.parse(row.images) : [];
    res.json(row);
  } catch (err) {
    console.error("取得單一商品失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= 啟動 server =================
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});