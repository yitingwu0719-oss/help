const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { Pool } = require('pg'); // 引入 PostgreSQL 連線池

const app = express();
const PORT = 3000;

// ================= PostgreSQL 連線池設定 =================
// 🚨 VERCEL 環境變數：PostgreSQL 連線字串
// Vercel 會自動從環境變數 DATABASE_URL 讀取
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // 允許 Vercel Serverless Function 連線 (生產環境通常需要)
  }
});

// ================= 資料庫操作輔助函數 =================
// 這是我們將 SQLite 的 dbRun/dbAll 轉換為 pg 的版本
const dbRun = async (query, params = []) => {
  const client = await pool.connect();
  try {
    // 使用 client.query() 執行指令
    const result = await client.query(query, params);
    // 模擬 SQLite 的 this.lastID
    return { lastID: result.rows.length > 0 ? result.rows[0].id : undefined }; 
  } finally {
    client.release(); // 釋放連線
  }
};

const dbAll = async (query, params = []) => {
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result.rows;
  } finally {
    client.release();
  }
};

const dbGet = async (query, params = []) => {
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result.rows[0] || null;
  } finally {
    client.release();
  }
};

// ================= 建表 (PostgreSQL 語法) =================
// 這是專門為 PostgreSQL 設計的建表指令
const createTable = async () => {
  try {
    // SERIAL 是 PostgreSQL 的自動增長 ID 類型
    await dbRun(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        zhTitle TEXT,
        enTitle TEXT,
        zhPrice TEXT,
        enPrice TEXT,
        zhDesc TEXT,
        enDesc TEXT,
        link TEXT,
        image TEXT,
        images TEXT, 
        category TEXT DEFAULT 'wood'
      )
    `);
    console.log("PostgreSQL table 'products' checked/created successfully.");
  } catch (err) {
    console.error("Error creating PostgreSQL table:", err);
  }
};

// 在伺服器啟動時檢查或建立表格
createTable();


// ================= Multer 檔案儲存設定 (不變) =================
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

// ================= JSON & CORS (不變) =================
app.use(express.json());
app.use(cors());
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));


// ================= 商品 API (PostgreSQL 版本) =================

// 新增商品
app.post("/products", upload.array("newImages"), async (req, res) => {
  try {
    const { zhTitle, enTitle, zhPrice, enPrice, zhDesc, enDesc, link, category } = req.body;
    
    if (!zhTitle || !zhPrice || !zhDesc || !link) {
      return res.status(400).json({ error: "商品中文名稱、價格、描述與連結為必填" });
    }

    const productCategory = category || 'wood';
    const files = req.files || [];
    const imagesArray = files.map(file => `/uploads/${file.filename}`);
    const mainImage = imagesArray[0] || null;
    
    // VALUES 語法不變，但我們使用 RETURNING id 來取得新增後的 ID
    const query = `
      INSERT INTO products 
        (zhTitle, enTitle, zhPrice, enPrice, zhDesc, enDesc, link, image, images, category)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id;
    `;
    const values = [
      zhTitle, enTitle, zhPrice, enPrice, zhDesc, enDesc, link, 
      mainImage, JSON.stringify(imagesArray), productCategory
    ];

    const result = await dbGet(query, values); // 使用 dbGet 來取得返回的 id

    res.status(201).json({
      id: result.id, // 使用返回的 ID
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

// 取得所有商品
app.get("/products", async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM products ORDER BY id DESC");
    // 解析 JSON 字串為陣列
    const parsed = rows.map(r => ({ ...r, images: r.images ? JSON.parse(r.images) : [] }));
    res.json(parsed);
  } catch (err) {
    console.error("取得所有商品失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

// 取得單一商品
app.get("/products/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const row = await dbGet("SELECT * FROM products WHERE id = $1", [id]);
    if (!row) return res.status(404).json({ error: "商品不存在" });
    // 解析 JSON 字串為陣列
    row.images = row.images ? JSON.parse(row.images) : [];
    res.json(row);
  } catch (err) {
    console.error("取得單一商品失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

// 修改商品
app.put("/products/:id", upload.array("newImages"), async (req, res) => {
  const { id } = req.params;
  const { zhTitle, enTitle, zhPrice, enPrice, zhDesc, enDesc, link, existingImages, category } = req.body;

  try {
    const product = await dbGet("SELECT * FROM products WHERE id = $1", [id]);
    if (!product) return res.status(404).json({ error: "商品不存在" });

    // 1. 處理圖片 (與 SQLite 版本邏輯相同)
    let imagesArray = [];
    if (existingImages) {
      try {
        imagesArray = JSON.parse(existingImages).filter(img => typeof img === 'string' && img.startsWith('/uploads/'));
      } catch {
        imagesArray = [];
      }
    }
    if (req.files && req.files.length > 0) {
      const newFiles = req.files.map(f => `/uploads/${f.filename}`);
      imagesArray = imagesArray.concat(newFiles);
    }
    const mainImage = imagesArray[0] || null;

    // 2. 更新資料庫 (使用 $1, $2... 佔位符)
    const query = `
      UPDATE products 
      SET zhTitle=$1, enTitle=$2, zhPrice=$3, enPrice=$4, zhDesc=$5, enDesc=$6, link=$7, image=$8, images=$9, category=$10
      WHERE id=$11
    `;
    const values = [
      zhTitle || product.zhTitle,
      enTitle || product.enTitle,
      zhPrice || product.zhPrice,
      enPrice || product.enPrice,
      zhDesc || product.zhDesc,
      enDesc || product.enDesc,
      link || product.link,
      mainImage,
      JSON.stringify(imagesArray),
      category || product.category,
      id
    ];

    await dbRun(query, values);

    res.json({ message: "修改成功", images: imagesArray });
  } catch (err) {
    console.error("修改商品失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

// 刪除商品 (不變，但使用 $1 佔位符)
app.delete("/products/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const product = await dbGet("SELECT * FROM products WHERE id = $1", [id]);
    if (!product) return res.status(404).json({ error: "商品不存在" });

    // 刪除檔案邏輯不變
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

    await dbRun("DELETE FROM products WHERE id = $1", [id]);
    res.json({ message: "商品已刪除" });
  } catch (err) {
    console.error("刪除商品失敗:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= 啟動 server =================
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});