import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { name, price, description, image } = req.body;
    try {
      const result = await sql`
        INSERT INTO products (name, price, description, image)
        VALUES (${name}, ${price}, ${description}, ${image})
        RETURNING *;
      `;
      res.status(200).json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  if (req.method === "GET") {
    try {
      const result = await sql`SELECT * FROM products;`;
      res.status(200).json(result.rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}
