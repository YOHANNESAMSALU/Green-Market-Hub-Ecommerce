const path = require('path');
const fsSync = require('fs');
const fs = require('fs/promises');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { createHash, randomUUID, scryptSync, timingSafeEqual } = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const PORT = process.env.PORT || 5001;
const BACKEND_BASE_URL = (process.env.BACKEND_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const DEV_ALLOW_SELF_ADMIN = String(process.env.DEV_ALLOW_SELF_ADMIN || 'true').toLowerCase() === 'true';
const PROMO_BANNER_SETTING_KEY = 'PROMO_BANNER_IMAGE';
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DEFAULT_SELLER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ETHIOPIAN_PHONE_REGEX = /^(?:\+251|0)?9\d{8}$/;
const SESSION_TTL_DAYS = 30;

const ALLOWED_IMAGE_MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const normalizeEnv = (value) => (typeof value === 'string' ? value.trim() : '');
const stripWrappingQuotes = (value) => String(value || '').replace(/^['"]|['"]$/g, '');
const parseCloudinaryConfig = () => {
  const cloudinaryUrl = normalizeEnv(process.env.CLOUDINARY_URL);
  if (cloudinaryUrl) {
    try {
      const parsed = new URL(cloudinaryUrl);
      const cloudName = normalizeEnv(parsed.hostname);
      const apiKey = normalizeEnv(decodeURIComponent(parsed.username));
      const apiSecret = normalizeEnv(decodeURIComponent(parsed.password));
      if (cloudName && apiKey && apiSecret) {
        return { cloudName, apiKey, apiSecret };
      }
    } catch (err) {
      console.warn('Invalid CLOUDINARY_URL. Falling back to explicit Cloudinary env vars.', err.message);
    }
  }

  const cloudName = normalizeEnv(process.env.CLOUDINARY_CLOUD_NAME);
  const apiKey = normalizeEnv(process.env.CLOUDINARY_API_KEY);
  const apiSecret = normalizeEnv(process.env.CLOUDINARY_API_SECRET);
  if (cloudName && apiKey && apiSecret) {
    return { cloudName, apiKey, apiSecret };
  }
  return null;
};

const dbHost = normalizeEnv(process.env.DB_HOST);
const dbPort = Number.parseInt(normalizeEnv(process.env.DB_PORT), 10);
const databaseUrl = normalizeEnv(process.env.DATABASE_URL);
const dbCaPath = stripWrappingQuotes(normalizeEnv(process.env.DB_CA_PATH));
const sslDefault = dbHost.includes('tidbcloud.com') ? 'true' : 'false';
const dbSslEnabled = String(process.env.DB_SSL || sslDefault).toLowerCase() === 'true';

const dbConfig = databaseUrl
  ? {
      uri: databaseUrl,
      waitForConnections: true,
      connectionLimit: Number.parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
      queueLimit: 0,
    }
  : {
      host: dbHost,
      port: Number.isFinite(dbPort) ? dbPort : 3306,
      user: normalizeEnv(process.env.DB_USER),
      password: normalizeEnv(process.env.DB_PASSWORD),
      database: normalizeEnv(process.env.DB_NAME),
      waitForConnections: true,
      connectionLimit: Number.parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10),
      queueLimit: 0,
    };

if (dbSslEnabled) {
  dbConfig.ssl = {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
  };
  if (dbCaPath) {
    try {
      dbConfig.ssl.ca = fsSync.readFileSync(dbCaPath, 'utf8');
    } catch (err) {
      console.warn(`Could not read DB_CA_PATH at "${dbCaPath}". Falling back to system CA store.`, err.message);
    }
  }
}

const pool = mysql.createPool(dbConfig);
const CLOUDINARY_CONFIG = parseCloudinaryConfig();

const hashValue = (value) => createHash('sha256').update(String(value)).digest('hex');

const normalizeEmail = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const normalizeEthiopianPhone = (value) => {
  if (typeof value !== 'string') return '';
  const compact = value.replace(/[^\d+]/g, '');
  if (!compact) return '';
  if (compact.startsWith('+251')) return compact;
  if (compact.startsWith('251')) return `+${compact}`;
  if (compact.startsWith('0')) return `+251${compact.slice(1)}`;
  if (compact.startsWith('9')) return `+251${compact}`;
  return compact;
};

const isValidEmail = (value) => EMAIL_REGEX.test(value);
const isValidEthiopianPhone = (value) => ETHIOPIAN_PHONE_REGEX.test(value);

const getSessionTokenFromRequest = (req) => {
  const token = req.headers['x-session-token'];
  return typeof token === 'string' ? token.trim() : '';
};

const createSessionToken = () => `${randomUUID()}.${require('crypto').randomBytes(24).toString('hex')}`;

const createSession = async (userId) => {
  const sessionId = randomUUID();
  const sessionToken = createSessionToken();
  const tokenHash = hashValue(sessionToken);

  await pool.execute(
    `
    INSERT INTO AuthSession (id, userId, tokenHash, expiresAt)
    VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, DATE_ADD(NOW(), INTERVAL ? DAY))
    `,
    [sessionId, userId, tokenHash, SESSION_TTL_DAYS],
  );

  return sessionToken;
};

const resolveSessionUserId = async (req) => {
  const sessionToken = getSessionTokenFromRequest(req);
  if (!sessionToken) return null;

  const [rows] = await pool.execute(
    `
    SELECT BIN_TO_UUID(userId) AS userId
    FROM AuthSession
    WHERE tokenHash = ? AND expiresAt > NOW()
    LIMIT 1
    `,
    [hashValue(sessionToken)],
  );

  return rows.length ? String(rows[0].userId) : null;
};

const toPublicImageUrl = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (normalized.startsWith('/uploads/')) return `${BACKEND_BASE_URL}${normalized}`;
  return normalized;
};

const parseImageArray = (value) => {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string' && item.trim())
      .map((item) => toPublicImageUrl(item.trim()));
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item) => typeof item === 'string' && item.trim())
          .map((item) => toPublicImageUrl(item.trim()));
      }
    } catch {
      return [];
    }
  }
  return [];
};

const parseJsonObject = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeVariantGroupsInput = (input, fallbackPrice, fallbackDiscountPrice, fallbackStock) => {
  if (!Array.isArray(input)) return [];
  return input
    .map((group) => {
      const type = String(group?.type || '').trim();
      const values = Array.isArray(group?.values) ? group.values : [];
      if (!type || !values.length) return null;
      const normalizedValues = values
        .map((valueRow) => {
          const value = String(valueRow?.value || valueRow?.title || '').trim();
          if (!value) return null;
          const priceRaw = Number(valueRow?.price);
          const discountRaw = valueRow?.discountPrice;
          const stockRaw = Number(valueRow?.stock);
          const price = Number.isFinite(priceRaw) ? priceRaw : Number(fallbackPrice || 0);
          const discountPrice =
            discountRaw === '' || discountRaw === null || discountRaw === undefined
              ? (fallbackDiscountPrice ?? null)
              : Number(discountRaw);
          const stock = Number.isFinite(stockRaw) ? stockRaw : Number(fallbackStock || 0);
          return {
            value,
            title: String(valueRow?.title || `${type}: ${value}`).trim(),
            sku: String(valueRow?.sku || '').trim(),
            price,
            discountPrice: Number.isFinite(discountPrice) ? discountPrice : null,
            stock,
            images: Array.isArray(valueRow?.images) ? valueRow.images.filter((img) => typeof img === 'string') : [],
          };
        })
        .filter(Boolean);
      if (!normalizedValues.length) return null;
      return { type, values: normalizedValues };
    })
    .filter(Boolean);
};

const groupVariantRows = (variantRows) => {
  const byProductId = new Map();
  for (const row of variantRows) {
    const productId = String(row.productId || '');
    if (!productId) continue;
    const attributes = parseJsonObject(row.attributes) || {};
    const variant = {
      id: String(row.id || ''),
      sku: String(row.sku || ''),
      title: String(row.title || ''),
      price: Number(row.price || 0),
      discountPrice: row.discount_price === null || row.discount_price === undefined ? null : Number(row.discount_price),
      stock: Number(row.stock || 0),
      attributes,
      images: parseImageArray(row.images),
    };
    const list = byProductId.get(productId) || [];
    list.push(variant);
    byProductId.set(productId, list);
  }

  const groupedByType = new Map();
  for (const [productId, variants] of byProductId.entries()) {
    const groupsMap = new Map();
    for (const variant of variants) {
      const type = String(variant.attributes?.type || 'Variant').trim() || 'Variant';
      const value = String(variant.attributes?.value || variant.title || variant.sku || '').trim();
      if (!value) continue;
      const values = groupsMap.get(type) || [];
      values.push({
        id: variant.id,
        value,
        title: variant.title || `${type}: ${value}`,
        sku: variant.sku,
        price: variant.price,
        discountPrice: variant.discountPrice,
        stock: variant.stock,
        images: variant.images,
      });
      groupsMap.set(type, values);
    }
    groupedByType.set(
      productId,
      Array.from(groupsMap.entries()).map(([type, values]) => ({ type, values })),
    );
  }
  return { byProductId, groupedByType };
};

const fetchProductVariantsByProductIds = async (productIds) => {
  const ids = Array.from(new Set((productIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!ids.length) return { byProductId: new Map(), groupedByType: new Map() };

  const placeholders = ids.map(() => 'UUID_TO_BIN(?)').join(',');
  const [variantRows] = await pool.execute(
    `
    SELECT
      BIN_TO_UUID(id) AS id,
      BIN_TO_UUID(product_id) AS productId,
      sku,
      title,
      price,
      discount_price,
      stock,
      attributes,
      images
    FROM ProductVariant
    WHERE product_id IN (${placeholders})
    `,
    ids,
  );
  return groupVariantRows(variantRows);
};

const replaceProductVariants = async ({ productId, variantGroups, fallbackPrice, fallbackDiscountPrice, fallbackStock }) => {
  const normalized = normalizeVariantGroupsInput(
    variantGroups,
    fallbackPrice,
    fallbackDiscountPrice,
    fallbackStock,
  );

  await pool.execute(`DELETE FROM ProductVariant WHERE product_id = UUID_TO_BIN(?)`, [productId]);
  if (!normalized.length) return;

  for (const group of normalized) {
    for (const valueRow of group.values) {
      const resolvedImages = await resolveImagesInput(valueRow.images, 'products');
      const variantId = randomUUID();
      const attributes = { type: group.type, value: valueRow.value };
      await pool.execute(
        `
        INSERT INTO ProductVariant (
          id, product_id, sku, title, price, discount_price, stock, attributes, images
        )
        VALUES (
          UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?
        )
        `,
        [
          variantId,
          productId,
          valueRow.sku || `VAR-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          valueRow.title,
          Number(valueRow.price || 0),
          valueRow.discountPrice === null ? null : Number(valueRow.discountPrice),
          Number(valueRow.stock || 0),
          JSON.stringify(attributes),
          JSON.stringify(resolvedImages),
        ],
      );
    }
  }
};

const saveImageDataUrl = async (dataUrl, folder) => {
  if (!CLOUDINARY_CONFIG) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET.');
  }

  const normalized = String(dataUrl || '').trim();
  const match = normalized.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid image data format');

  const mimeType = String(match[1] || '').toLowerCase();
  const base64Data = String(match[2] || '');
  const extension = ALLOWED_IMAGE_MIME_EXT[mimeType];
  if (!extension) throw new Error('Unsupported image type');

  const buffer = Buffer.from(base64Data, 'base64');
  if (!buffer.length) throw new Error('Image payload is empty');
  if (buffer.length > 5 * 1024 * 1024) throw new Error('Image exceeds 5MB limit');

  const safeFolder = String(folder || 'general').replace(/[^a-zA-Z0-9_-]/g, '');
  const timestamp = Math.floor(Date.now() / 1000);
  const signaturePayload = `folder=${safeFolder}&timestamp=${timestamp}${CLOUDINARY_CONFIG.apiSecret}`;
  const signature = createHash('sha1').update(signaturePayload).digest('hex');

  const payload = new URLSearchParams({
    file: normalized,
    api_key: CLOUDINARY_CONFIG.apiKey,
    timestamp: String(timestamp),
    folder: safeFolder,
    signature,
  });

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload.toString(),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.secure_url) {
    throw new Error(body?.error?.message || 'Cloudinary upload failed');
  }

  return String(body.secure_url);
};

const resolveImageInput = async (value, folder) => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (!normalized) return '';
  if (normalized.startsWith('data:image/')) return saveImageDataUrl(normalized, folder);
  return toPublicImageUrl(normalized);
};

const resolveImagesInput = async (value, folder) => {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const item of value) {
    const image = await resolveImageInput(item, folder);
    if (image) result.push(image);
  }
  return result;
};

const fetchUserById = async (userId) => {
  const [rows] = await pool.execute(
    `
    SELECT
      BIN_TO_UUID(id) AS id,
      name,
      email,
      phone,
      image,
      role,
      isApproved
    FROM User
    WHERE id = UUID_TO_BIN(?)
    LIMIT 1
    `,
    [userId],
  );

  return rows.length ? { ...rows[0], image: toPublicImageUrl(rows[0].image) } : null;
};

const requireAdmin = async (req, res) => {
  const userId = await resolveSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  const user = await fetchUserById(userId);
  if (!user || String(user.role).toUpperCase() !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }

  return user;
};

async function ensureTables() {
  await pool.execute(
    `
    CREATE TABLE IF NOT EXISTS AppSetting (
      \`key\` VARCHAR(128) PRIMARY KEY,
      value LONGTEXT NULL,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
    `,
  );

  const execSafe = async (sql) => {
    try {
      await pool.execute(sql);
    } catch (err) {
      const code = Number(err?.errno || 0);
      if ([1060, 1061, 1091, 1553].includes(code)) return;
      throw err;
    }
  };

  await execSafe(`
    ALTER TABLE CartItem
    ADD COLUMN variantSignature VARCHAR(191) NOT NULL DEFAULT ''
  `);
  await execSafe(`
    ALTER TABLE CartItem
    ADD COLUMN variantSnapshot JSON NULL
  `);
  await execSafe(`
    ALTER TABLE OrderItem
    ADD COLUMN variantSignature VARCHAR(191) NOT NULL DEFAULT ''
  `);
  await execSafe(`
    ALTER TABLE OrderItem
    ADD COLUMN variantSnapshot JSON NULL
  `);

  const [indexes] = await pool.execute(
    `
    SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'CartItem'
    GROUP BY INDEX_NAME, NON_UNIQUE
    `,
  );

  for (const indexRow of indexes) {
    if (Number(indexRow.NON_UNIQUE) !== 0) continue;
    const cols = String(indexRow.cols || '');
    if (cols === 'userId,productId') {
      await execSafe(`ALTER TABLE CartItem DROP INDEX \`${String(indexRow.INDEX_NAME)}\``);
    }
  }

  await execSafe(`
    CREATE UNIQUE INDEX ux_cart_user_product_variant
    ON CartItem (userId, productId, variantSignature)
  `);
}

const verifyPassword = (plainPassword, storedHash) => {
  const normalizedStored = String(storedHash || '');
  if (!normalizedStored) return false;

  if (normalizedStored.startsWith('scrypt$')) {
    const [, salt, digestHex] = normalizedStored.split('$');
    if (!salt || !digestHex) return false;

    const calculated = scryptSync(String(plainPassword), salt, 64);
    const expected = Buffer.from(digestHex, 'hex');
    return expected.length === calculated.length && timingSafeEqual(expected, calculated);
  }

  return String(plainPassword) === normalizedStored;
};

// Auth
app.post('/auth/login', async (req, res) => {
  const { email, phone, password } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizeEthiopianPhone(phone);
  const normalizedPassword = typeof password === 'string' ? password.trim() : '';

  if (!normalizedPassword) return res.status(400).json({ error: 'password is required' });
  if (!normalizedEmail && !normalizedPhone) {
    return res.status(400).json({ error: 'email or Ethiopian phone number is required' });
  }
  if (normalizedEmail && !isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (normalizedPhone && !isValidEthiopianPhone(normalizedPhone)) {
    return res.status(400).json({ error: 'Invalid Ethiopian phone number format' });
  }

  try {
    const [rows] = await pool.execute(
      `
      SELECT BIN_TO_UUID(id) AS id, password
      FROM User
      WHERE email = ? OR phone = ?
      LIMIT 1
      `,
      [normalizedEmail || '__no_email__', normalizedPhone || '__no_phone__'],
    );

    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    if (!verifyPassword(normalizedPassword, String(rows[0].password || ''))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const sessionToken = await createSession(String(rows[0].id));
    const user = await fetchUserById(String(rows[0].id));
    res.json({ ok: true, sessionToken, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/auth/me', async (req, res) => {
  try {
    const userId = await resolveSessionUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = await fetchUserById(userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    res.json({ ok: true, user });
  } catch (err) {
    console.error('Auth me error:', err);
    res.status(500).json({ error: 'Failed to fetch session user' });
  }
});

app.post('/auth/logout', async (req, res) => {
  try {
    const sessionToken = getSessionTokenFromRequest(req);
    if (!sessionToken) return res.json({ ok: true });
    await pool.execute(`DELETE FROM AuthSession WHERE tokenHash = ?`, [hashValue(sessionToken)]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

app.post('/auth/dev/promote-admin', async (req, res) => {
  try {
    if (!DEV_ALLOW_SELF_ADMIN) return res.status(403).json({ error: 'Dev self-promotion is disabled' });
    const userId = await resolveSessionUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    await pool.execute(`UPDATE User SET role = 'ADMIN', isApproved = 1 WHERE id = UUID_TO_BIN(?)`, [userId]);
    const user = await fetchUserById(userId);
    res.json({ ok: true, user });
  } catch (err) {
    console.error('Dev admin promotion error:', err);
    res.status(500).json({ error: 'Could not promote current user to admin' });
  }
});

// Public settings for banner preview on admin forms
app.get('/settings/promo-banner', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT value FROM AppSetting WHERE \`key\` = ? LIMIT 1`,
      [PROMO_BANNER_SETTING_KEY],
    );
    res.json({ image: rows.length ? toPublicImageUrl(rows[0].value) : '' });
  } catch (err) {
    console.error('Promo banner settings read error:', err);
    res.status(500).json({ error: 'Could not load promo banner settings' });
  }
});

const parseMonthParam = (value) => {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) return null;
  const [yearRaw, monthRaw] = normalized.split('-');
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
};

const startOfUtcDay = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const addUtcHours = (date, hours) => new Date(date.getTime() + hours * 60 * 60 * 1000);
const addUtcDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
const addUtcMonths = (date, months) => new Date(Date.UTC(
  date.getUTCFullYear(),
  date.getUTCMonth() + months,
  date.getUTCDate(),
  date.getUTCHours(),
  date.getUTCMinutes(),
  date.getUTCSeconds(),
));

const toDateTimeSql = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
const toDateSql = (date) => date.toISOString().slice(0, 10);
const monthKey = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
const hourKey = (date) => `${toDateSql(date)} ${String(date.getUTCHours()).padStart(2, '0')}:00:00`;

const buildAnalysisWindow = (range, monthParam) => {
  const now = new Date();
  const normalizedRange = String(range || 'week').toLowerCase();

  if (normalizedRange === 'day') {
    const end = new Date();
    const start = addUtcHours(end, -23);
    start.setUTCMinutes(0, 0, 0);

    const slots = [];
    let cursor = new Date(start);
    while (cursor <= end) {
      slots.push({
        key: hourKey(cursor),
        label: `${String(cursor.getUTCHours()).padStart(2, '0')}:00`,
      });
      cursor = addUtcHours(cursor, 1);
    }

    return {
      range: 'day',
      start,
      end: addUtcHours(new Date(end.setUTCMinutes(59, 59, 999)), 0),
      bucketExpr: "DATE_FORMAT(o.createdAt, '%Y-%m-%d %H:00:00')",
      slots,
      selectedMonth: null,
    };
  }

  if (normalizedRange === 'month') {
    const picked = parseMonthParam(monthParam) || { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
    const start = new Date(Date.UTC(picked.year, picked.month - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(picked.year, picked.month, 1, 0, 0, 0, 0));

    const slots = [];
    let cursor = new Date(start);
    while (cursor < end) {
      slots.push({ key: toDateSql(cursor), label: String(cursor.getUTCDate()) });
      cursor = addUtcDays(cursor, 1);
    }

    return {
      range: 'month',
      start,
      end,
      bucketExpr: "DATE_FORMAT(o.createdAt, '%Y-%m-%d')",
      slots,
      selectedMonth: monthKey(start),
    };
  }

  if (normalizedRange === 'halfyear') {
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const start = addUtcMonths(currentMonthStart, -5);
    const end = addUtcMonths(currentMonthStart, 1);

    const slots = [];
    let cursor = new Date(start);
    while (cursor < end) {
      slots.push({ key: monthKey(cursor), label: cursor.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) });
      cursor = addUtcMonths(cursor, 1);
    }

    return {
      range: 'halfyear',
      start,
      end,
      bucketExpr: "DATE_FORMAT(o.createdAt, '%Y-%m')",
      slots,
      selectedMonth: null,
    };
  }

  if (normalizedRange === 'year') {
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const start = addUtcMonths(currentMonthStart, -11);
    const end = addUtcMonths(currentMonthStart, 1);

    const slots = [];
    let cursor = new Date(start);
    while (cursor < end) {
      slots.push({ key: monthKey(cursor), label: cursor.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) });
      cursor = addUtcMonths(cursor, 1);
    }

    return {
      range: 'year',
      start,
      end,
      bucketExpr: "DATE_FORMAT(o.createdAt, '%Y-%m')",
      slots,
      selectedMonth: null,
    };
  }

  const end = startOfUtcDay(now);
  const start = addUtcDays(end, -6);
  const slots = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    slots.push({
      key: toDateSql(cursor),
      label: cursor.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
    });
    cursor = addUtcDays(cursor, 1);
  }

  return {
    range: 'week',
    start,
    end: addUtcDays(end, 1),
    bucketExpr: "DATE_FORMAT(o.createdAt, '%Y-%m-%d')",
    slots,
    selectedMonth: null,
  };
};

// Admin APIs
app.get('/admin/reports', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [[usersCount]] = await pool.execute('SELECT COUNT(*) AS count FROM User');
    const [[sellersCount]] = await pool.execute("SELECT COUNT(*) AS count FROM User WHERE role = 'SELLER' AND isApproved = 1");
    const [[productsCount]] = await pool.execute('SELECT COUNT(*) AS count FROM Product');
    const [[ordersCount]] = await pool.execute('SELECT COUNT(*) AS count FROM `Order`');
    const [[revenue]] = await pool.execute('SELECT COALESCE(SUM(totalAmount), 0) AS total FROM `Order`');

    const [topProducts] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(p.id) AS id,
        p.name,
        COALESCE(SUM(oi.quantity), 0) AS unitsSold,
        COALESCE(SUM(oi.quantity * oi.price), 0) AS revenue
      FROM Product p
      LEFT JOIN OrderItem oi ON oi.productId = p.id
      GROUP BY p.id, p.name
      ORDER BY unitsSold DESC, revenue DESC
      LIMIT 10
      `,
    );

    res.json({
      stats: {
        totalUsers: Number(usersCount.count || 0),
        totalSellers: Number(sellersCount.count || 0),
        totalProducts: Number(productsCount.count || 0),
        totalOrders: Number(ordersCount.count || 0),
        totalRevenue: Number(revenue.total || 0),
      },
      topProducts: topProducts.map((row) => ({
        ...row,
        unitsSold: Number(row.unitsSold || 0),
        revenue: Number(row.revenue || 0),
      })),
    });
  } catch (err) {
    console.error('Admin reports error:', err);
    res.status(500).json({ error: 'Could not load reports' });
  }
});

app.get('/admin/analysis', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const windowDef = buildAnalysisWindow(req.query.range, req.query.month);
    const startSql = toDateTimeSql(windowDef.start);
    const endSql = toDateTimeSql(windowDef.end);

    const [seriesRows] = await pool.execute(
      `
      SELECT
        ${windowDef.bucketExpr} AS bucket,
        COUNT(DISTINCT o.id) AS ordersCount,
        COALESCE(SUM(o.totalAmount), 0) AS revenue
      FROM \`Order\` o
      JOIN Payment p ON p.orderId = o.id
      WHERE p.status = 'SUCCESS' AND o.createdAt >= ? AND o.createdAt < ?
      GROUP BY bucket
      ORDER BY bucket ASC
      `,
      [startSql, endSql],
    );

    const [summaryRows] = await pool.execute(
      `
      SELECT
        COUNT(DISTINCT o.id) AS totalOrders,
        COALESCE(SUM(o.totalAmount), 0) AS totalRevenue,
        COALESCE(AVG(o.totalAmount), 0) AS avgOrderValue
      FROM \`Order\` o
      JOIN Payment p ON p.orderId = o.id
      WHERE p.status = 'SUCCESS' AND o.createdAt >= ? AND o.createdAt < ?
      `,
      [startSql, endSql],
    );

    const [topProducts] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(pr.id) AS id,
        pr.name,
        COALESCE(SUM(oi.quantity), 0) AS unitsSold,
        COALESCE(SUM(oi.quantity * oi.price), 0) AS revenue
      FROM OrderItem oi
      JOIN \`Order\` o ON o.id = oi.orderId
      JOIN Payment p ON p.orderId = o.id AND p.status = 'SUCCESS'
      JOIN Product pr ON pr.id = oi.productId
      WHERE o.createdAt >= ? AND o.createdAt < ?
      GROUP BY pr.id, pr.name
      ORDER BY unitsSold DESC, revenue DESC
      LIMIT 10
      `,
      [startSql, endSql],
    );

    const rowByBucket = new Map(
      seriesRows.map((row) => [
        String(row.bucket),
        { ordersCount: Number(row.ordersCount || 0), revenue: Number(row.revenue || 0) },
      ]),
    );

    const series = windowDef.slots.map((slot) => {
      const found = rowByBucket.get(slot.key);
      return {
        key: slot.key,
        label: slot.label,
        ordersCount: found?.ordersCount || 0,
        revenue: found?.revenue || 0,
      };
    });

    const summary = summaryRows[0] || {};
    res.json({
      range: windowDef.range,
      selectedMonth: windowDef.selectedMonth,
      start: startSql,
      end: endSql,
      summary: {
        totalOrders: Number(summary.totalOrders || 0),
        totalRevenue: Number(summary.totalRevenue || 0),
        avgOrderValue: Number(summary.avgOrderValue || 0),
      },
      series,
      topProducts: topProducts.map((row) => ({
        ...row,
        unitsSold: Number(row.unitsSold || 0),
        revenue: Number(row.revenue || 0),
      })),
    });
  } catch (err) {
    console.error('Admin analysis error:', err);
    res.status(500).json({ error: 'Could not load analysis data' });
  }
});

app.get('/admin/delivery-orders', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const limitRaw = Number.parseInt(String(req.query.limit || '100'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 500)) : 100;

    const [orderRows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(o.id) AS id,
        BIN_TO_UUID(o.userId) AS userId,
        o.totalAmount,
        o.status,
        o.shippingCost,
        o.trackingNumber,
        o.createdAt,
        u.name AS customerName,
        u.email AS customerEmail,
        u.phone AS customerPhone,
        p.method AS paymentMethod,
        p.status AS paymentStatus,
        p.transactionId,
        p.createdAt AS paymentCreatedAt,
        a.fullName AS addressFullName,
        a.phone AS addressPhone,
        a.city AS addressCity,
        a.subCity AS addressSubCity,
        a.region AS addressRegion,
        a.details AS addressDetails
      FROM \`Order\` o
      JOIN User u ON u.id = o.userId
      JOIN Payment p ON p.orderId = o.id AND p.status = 'SUCCESS'
      LEFT JOIN (
        SELECT
          addr.id,
          addr.userId,
          addr.fullName,
          addr.phone,
          addr.city,
          addr.subCity,
          addr.region,
          addr.details
        FROM Address addr
        JOIN (
          SELECT userId, MAX(createdAt) AS maxCreatedAt
          FROM Address
          GROUP BY userId
        ) latest
          ON latest.userId = addr.userId
         AND latest.maxCreatedAt = addr.createdAt
      ) a
        ON a.userId = o.userId
      ORDER BY o.createdAt DESC
      LIMIT ${limit}
      `,
    );

    const orderIds = orderRows.map((row) => String(row.id));
    if (!orderIds.length) {
      return res.json([]);
    }

    const orderPlaceholders = orderIds.map(() => 'UUID_TO_BIN(?)').join(',');
    const [itemRows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(oi.id) AS id,
        BIN_TO_UUID(oi.orderId) AS orderId,
        BIN_TO_UUID(oi.productId) AS productId,
        oi.quantity,
        oi.price,
        oi.variantSignature,
        oi.variantSnapshot,
        p.name AS productName,
        p.sku AS productSku,
        p.images AS productImages
      FROM OrderItem oi
      LEFT JOIN Product p ON p.id = oi.productId
      WHERE oi.orderId IN (${orderPlaceholders})
      ORDER BY oi.id ASC
      `,
      orderIds,
    );

    const productIds = Array.from(new Set(itemRows.map((row) => String(row.productId || '')).filter(Boolean)));
    let variantsByProductId = new Map();
    if (productIds.length) {
      const productPlaceholders = productIds.map(() => 'UUID_TO_BIN(?)').join(',');
      const [variantRows] = await pool.execute(
        `
        SELECT
          BIN_TO_UUID(id) AS id,
          BIN_TO_UUID(product_id) AS productId,
          sku,
          title,
          price,
          discount_price,
          stock,
          attributes,
          images
        FROM ProductVariant
        WHERE product_id IN (${productPlaceholders})
        `,
        productIds,
      );

      variantsByProductId = variantRows.reduce((acc, row) => {
        const productId = String(row.productId || '');
        const attributes = (() => {
          if (typeof row.attributes !== 'string') return row.attributes || null;
          try {
            return JSON.parse(row.attributes);
          } catch {
            return row.attributes;
          }
        })();
        const variant = {
          id: String(row.id || ''),
          sku: row.sku || '',
          title: row.title || '',
          price: Number(row.price || 0),
          discountPrice: row.discount_price !== null && row.discount_price !== undefined ? Number(row.discount_price) : null,
          stock: Number(row.stock || 0),
          attributes,
          images: parseImageArray(row.images),
        };
        const list = acc.get(productId) || [];
        list.push(variant);
        acc.set(productId, list);
        return acc;
      }, new Map());
    }

    const itemsByOrderId = itemRows.reduce((acc, row) => {
      const orderId = String(row.orderId || '');
      const productId = String(row.productId || '');
      const variants = variantsByProductId.get(productId) || [];
      const unitPrice = Number(row.price || 0);
      const variantSnapshot = (() => {
        if (!row.variantSnapshot) return null;
        if (typeof row.variantSnapshot === 'object') return row.variantSnapshot;
        if (typeof row.variantSnapshot !== 'string') return null;
        try {
          return JSON.parse(row.variantSnapshot);
        } catch {
          return null;
        }
      })();
      const selectedVariant = variants.find((variant) =>
        Math.abs(Number(variant.discountPrice ?? variant.price ?? 0) - unitPrice) < 0.0001
        || Math.abs(Number(variant.price || 0) - unitPrice) < 0.0001
      ) || null;

      const item = {
        id: String(row.id || ''),
        productId,
        productName: row.productName || '',
        productSku: row.productSku || '',
        productImage: parseImageArray(row.productImages)[0] || '',
        quantity: Number(row.quantity || 0),
        unitPrice,
        totalPrice: unitPrice * Number(row.quantity || 0),
        selectedVariant: variantSnapshot || selectedVariant,
        variantOptions: variants,
      };

      const list = acc.get(orderId) || [];
      list.push(item);
      acc.set(orderId, list);
      return acc;
    }, new Map());

    const result = orderRows.map((order) => ({
      id: String(order.id),
      userId: String(order.userId),
      createdAt: order.createdAt,
      status: String(order.status || ''),
      totalAmount: Number(order.totalAmount || 0),
      shippingCost: Number(order.shippingCost || 0),
      trackingNumber: order.trackingNumber || '',
      payment: {
        method: String(order.paymentMethod || ''),
        status: String(order.paymentStatus || ''),
        transactionId: String(order.transactionId || ''),
        createdAt: order.paymentCreatedAt,
      },
      customer: {
        name: order.customerName || '',
        email: order.customerEmail || '',
        phone: order.customerPhone || '',
      },
      shippingAddress: {
        fullName: order.addressFullName || '',
        phone: order.addressPhone || '',
        city: order.addressCity || '',
        subCity: order.addressSubCity || '',
        region: order.addressRegion || '',
        details: order.addressDetails || '',
      },
      items: itemsByOrderId.get(String(order.id)) || [],
    }));

    res.json(result);
  } catch (err) {
    console.error('Admin delivery orders error:', err);
    res.status(500).json({ error: 'Could not load delivery orders' });
  }
});

app.get('/admin/categories', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [rows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(c.id) AS id,
        c.name,
        c.image,
        COUNT(p.id) AS productsCount
      FROM Category c
      LEFT JOIN Product p ON p.categoryId = c.id
      GROUP BY c.id, c.name, c.image
      ORDER BY c.name ASC
      `,
    );

    res.json(
      rows.map((row) => ({
        ...row,
        image: toPublicImageUrl(row.image),
        productsCount: Number(row.productsCount || 0),
      })),
    );
  } catch (err) {
    console.error('Admin categories error:', err);
    res.status(500).json({ error: 'Could not load categories' });
  }
});

app.post('/admin/categories', async (req, res) => {
  const { name, image } = req.body || {};
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  if (!normalizedName) return res.status(400).json({ error: 'name is required' });

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const normalizedImage = await resolveImageInput(image, 'categories');
    const id = randomUUID();
    await pool.execute(
      `INSERT INTO Category (id, name, parentId, image) VALUES (UUID_TO_BIN(?), ?, NULL, ?)`,
      [id, normalizedName, normalizedImage],
    );

    res.status(201).json({ ok: true, id });
  } catch (err) {
    console.error('Create category error:', err);
    res.status(500).json({ error: err?.sqlMessage || err?.message || 'Could not create category' });
  }
});

app.patch('/admin/categories/:id', async (req, res) => {
  const { id } = req.params;
  const { name, image } = req.body || {};

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const normalizedImage = image !== undefined ? await resolveImageInput(image, 'categories') : null;
    const [result] = await pool.execute(
      `
      UPDATE Category
      SET name = COALESCE(NULLIF(?, ''), name),
          image = COALESCE(?, image)
      WHERE id = UUID_TO_BIN(?)
      `,
      [typeof name === 'string' ? name.trim() : '', normalizedImage, id],
    );

    if (!result.affectedRows) return res.status(404).json({ error: 'Category not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Update category error:', err);
    res.status(500).json({ error: err?.sqlMessage || err?.message || 'Could not update category' });
  }
});

app.delete('/admin/categories/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [[used]] = await pool.execute(`SELECT COUNT(*) AS count FROM Product WHERE categoryId = UUID_TO_BIN(?)`, [id]);
    if (Number(used.count || 0) > 0) {
      return res.status(400).json({ error: 'Cannot delete category that still has products' });
    }

    const [result] = await pool.execute(`DELETE FROM Category WHERE id = UUID_TO_BIN(?)`, [id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Category not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete category error:', err);
    res.status(500).json({ error: err?.sqlMessage || err?.message || 'Could not delete category' });
  }
});

app.get('/admin/products', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [rows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(p.id) AS id,
        p.name,
        p.description,
        p.price,
        p.discountPrice,
        p.stock,
        p.sku,
        p.images,
        p.brand,
        BIN_TO_UUID(p.sellerId) AS sellerId,
        BIN_TO_UUID(p.categoryId) AS categoryId,
        c.name AS categoryName,
        u.name AS sellerName
      FROM Product p
      LEFT JOIN Category c ON c.id = p.categoryId
      LEFT JOIN User u ON u.id = p.sellerId
      ORDER BY p.createdAt DESC
      `,
    );

    const productIds = rows.map((row) => String(row.id));
    const { byProductId, groupedByType } = await fetchProductVariantsByProductIds(productIds);
    res.json(
      rows.map((row) => {
        const productId = String(row.id || '');
        return {
          ...row,
          images: parseImageArray(row.images),
          variants: byProductId.get(productId) || [],
          variantGroups: groupedByType.get(productId) || [],
        };
      }),
    );
  } catch (err) {
    console.error('Admin products error:', err);
    res.status(500).json({ error: 'Could not load products' });
  }
});

app.post('/admin/products', async (req, res) => {
  const { name, description, price, discountPrice, stock, sku, images, brand, sellerId, categoryId, variantGroups } = req.body || {};
  if (!name || !categoryId) return res.status(400).json({ error: 'name and categoryId are required' });

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const normalizedCategoryId = String(categoryId || '').trim();
    const resolvedSellerId = String(sellerId || admin.id || DEFAULT_SELLER_ID).trim();

    const [categoryRows] = await pool.execute(`SELECT BIN_TO_UUID(id) AS id FROM Category WHERE id = UUID_TO_BIN(?) LIMIT 1`, [normalizedCategoryId]);
    if (!categoryRows.length) return res.status(400).json({ error: 'Invalid categoryId' });

    const [sellerRows] = await pool.execute(`SELECT BIN_TO_UUID(id) AS id FROM User WHERE id = UUID_TO_BIN(?) LIMIT 1`, [resolvedSellerId]);
    if (!sellerRows.length) return res.status(400).json({ error: 'Invalid sellerId' });

    const parsedImages = await resolveImagesInput(images, 'products');
    const id = randomUUID();

    await pool.execute(
      `
      INSERT INTO Product (
        id, name, description, price, discountPrice, stock, sku, images, brand, weight, sellerId, categoryId
      )
      VALUES (
        UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?, NULL, UUID_TO_BIN(?), UUID_TO_BIN(?)
      )
      `,
      [
        id,
        String(name).trim(),
        typeof description === 'string' ? description.trim() : '',
        Number(price || 0),
        discountPrice !== undefined && discountPrice !== null && discountPrice !== '' ? Number(discountPrice) : null,
        Number(stock || 0),
        typeof sku === 'string' && sku.trim() ? sku.trim() : `SKU-${Date.now()}`,
        JSON.stringify(parsedImages),
        typeof brand === 'string' ? brand.trim() : '',
        resolvedSellerId,
        normalizedCategoryId,
      ],
    );

    await replaceProductVariants({
      productId: id,
      variantGroups,
      fallbackPrice: Number(price || 0),
      fallbackDiscountPrice:
        discountPrice !== undefined && discountPrice !== null && discountPrice !== '' ? Number(discountPrice) : null,
      fallbackStock: Number(stock || 0),
    });

    res.status(201).json({ ok: true, id });
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ error: err?.sqlMessage || err?.message || 'Could not create product' });
  }
});

app.patch('/admin/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, price, discountPrice, stock, sku, images, brand, sellerId, categoryId, variantGroups } = req.body || {};

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const parsedImages = images !== undefined ? await resolveImagesInput(images, 'products') : null;
    const normalizedDiscountPrice =
      discountPrice !== undefined ? (discountPrice === null || discountPrice === '' ? null : Number(discountPrice)) : undefined;

    const [result] = await pool.execute(
      `
      UPDATE Product
      SET
        name = COALESCE(NULLIF(?, ''), name),
        description = COALESCE(?, description),
        price = COALESCE(?, price),
        discountPrice = CASE WHEN ? = 1 THEN ? ELSE discountPrice END,
        stock = COALESCE(?, stock),
        sku = COALESCE(NULLIF(?, ''), sku),
        images = COALESCE(?, images),
        brand = COALESCE(?, brand),
        sellerId = COALESCE(UUID_TO_BIN(?), sellerId),
        categoryId = COALESCE(UUID_TO_BIN(?), categoryId)
      WHERE id = UUID_TO_BIN(?)
      `,
      [
        typeof name === 'string' ? name.trim() : '',
        description !== undefined ? String(description) : null,
        price !== undefined ? Number(price) : null,
        normalizedDiscountPrice !== undefined ? 1 : 0,
        normalizedDiscountPrice !== undefined ? normalizedDiscountPrice : null,
        stock !== undefined ? Number(stock) : null,
        typeof sku === 'string' ? sku.trim() : '',
        parsedImages !== null ? JSON.stringify(parsedImages) : null,
        brand !== undefined ? String(brand).trim() : null,
        sellerId || null,
        categoryId || null,
        id,
      ],
    );

    if (!result.affectedRows) return res.status(404).json({ error: 'Product not found' });

    if (variantGroups !== undefined) {
      await replaceProductVariants({
        productId: id,
        variantGroups,
        fallbackPrice: price !== undefined ? Number(price || 0) : 0,
        fallbackDiscountPrice:
          discountPrice !== undefined
            ? (discountPrice === null || discountPrice === '' ? null : Number(discountPrice))
            : null,
        fallbackStock: stock !== undefined ? Number(stock || 0) : 0,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ error: err?.sqlMessage || err?.message || 'Could not update product' });
  }
});

app.delete('/admin/products/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [result] = await pool.execute(`DELETE FROM Product WHERE id = UUID_TO_BIN(?)`, [id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Product not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: err?.sqlMessage || err?.message || 'Could not delete product' });
  }
});

app.get('/admin/users', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [rows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(id) AS id,
        name,
        email,
        role,
        phone,
        isApproved,
        createdAt
      FROM User
      ORDER BY createdAt DESC
      `,
    );
    res.json(rows);
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Could not load users' });
  }
});

app.patch('/admin/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, role, isApproved } = req.body || {};

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [result] = await pool.execute(
      `
      UPDATE User
      SET
        name = COALESCE(NULLIF(?, ''), name),
        email = COALESCE(NULLIF(?, ''), email),
        phone = COALESCE(NULLIF(?, ''), phone),
        role = COALESCE(NULLIF(?, ''), role),
        isApproved = COALESCE(?, isApproved)
      WHERE id = UUID_TO_BIN(?)
      `,
      [
        typeof name === 'string' ? name.trim() : '',
        typeof email === 'string' ? email.trim() : '',
        typeof phone === 'string' ? phone.trim() : '',
        typeof role === 'string' ? role.trim().toUpperCase() : '',
        isApproved !== undefined ? Number(isApproved) : null,
        id,
      ],
    );

    if (!result.affectedRows) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: err?.sqlMessage || err?.message || 'Could not update user' });
  }
});

app.get('/admin/seller-requests', async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [rows] = await pool.execute(
      `
      SELECT
        BIN_TO_UUID(r.id) AS id,
        BIN_TO_UUID(r.userId) AS userId,
        r.status,
        r.message,
        r.reviewNote,
        r.createdAt,
        r.reviewedAt,
        u.name,
        u.email,
        u.phone
      FROM SellerUpgradeRequest r
      JOIN User u ON u.id = r.userId
      ORDER BY r.createdAt DESC
      `,
    );

    res.json(rows);
  } catch (err) {
    console.error('Seller requests error:', err);
    res.status(500).json({ error: 'Could not load seller requests' });
  }
});

app.patch('/admin/seller-requests/:id', async (req, res) => {
  const { id } = req.params;
  const { action, reviewNote } = req.body || {};
  const normalizedAction = String(action || '').toUpperCase();

  if (!['APPROVE', 'REJECT'].includes(normalizedAction)) {
    return res.status(400).json({ error: "action must be 'APPROVE' or 'REJECT'" });
  }

  const connection = await pool.getConnection();
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `
      SELECT
        BIN_TO_UUID(id) AS id,
        BIN_TO_UUID(userId) AS userId,
        status
      FROM SellerUpgradeRequest
      WHERE id = UUID_TO_BIN(?)
      LIMIT 1
      `,
      [id],
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'Seller request not found' });
    }

    const request = rows[0];
    if (String(request.status).toUpperCase() !== 'PENDING') {
      await connection.rollback();
      return res.status(400).json({ error: 'Seller request is already processed' });
    }

    const nextStatus = normalizedAction === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    await connection.execute(
      `
      UPDATE SellerUpgradeRequest
      SET status = ?, reviewNote = ?, reviewedBy = UUID_TO_BIN(?), reviewedAt = NOW()
      WHERE id = UUID_TO_BIN(?)
      `,
      [nextStatus, typeof reviewNote === 'string' ? reviewNote.trim() : null, admin.id, id],
    );

    if (nextStatus === 'APPROVED') {
      await connection.execute(
        `
        UPDATE User
        SET role = 'SELLER', isApproved = 1
        WHERE id = UUID_TO_BIN(?)
        `,
        [request.userId],
      );
    }

    await connection.commit();
    res.json({ ok: true, status: nextStatus });
  } catch (err) {
    await connection.rollback();
    console.error('Review seller request error:', err);
    res.status(500).json({ error: err?.sqlMessage || err?.message || 'Could not review seller request' });
  } finally {
    connection.release();
  }
});

app.patch('/admin/settings/promo-banner', async (req, res) => {
  const { image } = req.body || {};

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    if (image === undefined) return res.status(400).json({ error: 'image is required' });

    const normalizedImage = await resolveImageInput(image, 'banners');
    await pool.execute(
      `
      INSERT INTO AppSetting (\`key\`, value)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE value = VALUES(value)
      `,
      [PROMO_BANNER_SETTING_KEY, normalizedImage],
    );

    res.json({ ok: true, image: normalizedImage });
  } catch (err) {
    console.error('Promo banner settings update error:', err);
    res.status(500).json({ error: err?.sqlMessage || err?.message || 'Could not update promo banner settings' });
  }
});

app.get('/', (req, res) => {
  res.send('Admin backend is running.');
});

ensureTables()
  .then(async () => {
    const connection = await pool.getConnection();
    connection.release();
    console.log('Connected to MySQL database.');

    app.listen(PORT, () => {
      console.log(`Admin backend running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Startup error:', err);
    process.exit(1);
  });
