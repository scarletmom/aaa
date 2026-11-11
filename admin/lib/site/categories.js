const { getPool, transaction } = require("./db");
const { isValidTag } = require("./posts");

const SELECT = `SELECT c.id, c.name, c.avatar, COUNT(r.post_tag) AS post_count
  FROM categories c LEFT JOIN resources r ON r.category_id = c.id`;

function toCategory(row) {
  return { id: row.id, name: row.name, avatar: row.avatar, postCount: Number(row.post_count) || 0 };
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function list() {
  const [rows] = await getPool().query(`${SELECT} GROUP BY c.id ORDER BY c.name ASC`);
  return rows.map(toCategory);
}

async function get(id) {
  const parsed = parseId(id);
  if (!parsed) return null;
  const [rows] = await getPool().query(`${SELECT} WHERE c.id = ? GROUP BY c.id`, [parsed]);
  return rows.length ? toCategory(rows[0]) : null;
}

async function memberTags(id) {
  const [rows] = await getPool().query("SELECT post_tag FROM resources WHERE category_id = ?", [id]);
  return rows.map((row) => row.post_tag);
}

async function nameTaken(name, exceptId = null) {
  const [rows] = await getPool().query("SELECT 1 FROM categories WHERE name = ? AND id <> ? LIMIT 1", [name, exceptId || 0]);
  return rows.length > 0;
}

async function create({ name, avatar }) {
  const [result] = await getPool().query("INSERT INTO categories (name, avatar) VALUES (?, ?)", [name, avatar]);
  return result.insertId;
}

async function update(id, { name, avatar }) {
  const [result] = await getPool().query("UPDATE categories SET name = ?, avatar = ? WHERE id = ?", [name, avatar, id]);
  return result.affectedRows > 0;
}

// Makes postTags exactly the category's members: listed posts join (leaving any other
// category), current members not listed become uncategorised.
async function setPosts(id, postTags) {
  const tags = postTags.filter(isValidTag);
  await transaction(async (connection) => {
    if (!tags.length) {
      await connection.query("UPDATE resources SET category_id = NULL WHERE category_id = ?", [id]);
      return;
    }
    await connection.query("UPDATE resources SET category_id = NULL WHERE category_id = ? AND post_tag NOT IN (?)", [id, tags]);
    await connection.query("UPDATE resources SET category_id = ? WHERE post_tag IN (?)", [id, tags]);
  });
}

// Posts in a deleted category stay live, just uncategorised (the FK is ON DELETE SET NULL).
async function remove(id) {
  const [result] = await getPool().query("DELETE FROM categories WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

module.exports = { list, get, memberTags, nameTaken, create, update, setPosts, remove, parseId };
