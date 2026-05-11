// Vercel Serverless Function - 松赞餐饮评估系统 API
// 支持 action: list / save / delete / login
// 环境变量：TENCENT_SECRET_ID, TENCENT_SECRET_KEY, ADMIN_PASSWORD

const COS = require('cos-nodejs-sdk-v5');

const BUCKET = 'tsering-1430983566';
const REGION = 'ap-guangzhou';
const FILE_PATH = 'songzan-data/ratings.json';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'songzan2026';
const LOGIN_TOKEN = 'sz_admin_2026_valid';

function getCosClient() {
  return new COS({
    SecretId: process.env.TENCENT_SECRET_ID || '',
    SecretKey: process.env.TENCENT_SECRET_KEY || '',
  });
}

function cosGetObject(cos) {
  return new Promise((resolve, reject) => {
    cos.getObject({ Bucket: BUCKET, Region: REGION, Key: FILE_PATH }, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function cosPutObject(cos, body) {
  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: BUCKET,
      Region: REGION,
      Key: FILE_PATH,
      Body: body,
      ContentType: 'application/json',
    }, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

async function readRatings(cos) {
  try {
    const data = await cosGetObject(cos);
    const str = Buffer.isBuffer(data.Body) ? data.Body.toString('utf-8') : String(data.Body);
    return JSON.parse(str);
  } catch (e) {
    if (e.statusCode === 404 || e.code === 'NoSuchKey') return [];
    throw e;
  }
}

async function writeRatings(cos, ratings) {
  await cosPutObject(cos, JSON.stringify(ratings, null, 2));
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query && req.query.action) || (req.body && req.body.action) || '';

  // ===== login =====
  if (action === 'login' || req.method === 'GET' && action === 'login') {
    const body = req.body || {};
    const password = body.password || '';
    if (password === ADMIN_PASSWORD) {
      return res.status(200).json({ success: true, token: LOGIN_TOKEN });
    } else {
      return res.status(200).json({ success: false, error: '密码错误' });
    }
  }

  // login via POST body
  if (req.method === 'POST' && (req.body || {}).action === 'login') {
    const password = (req.body || {}).password || '';
    if (password === ADMIN_PASSWORD) {
      return res.status(200).json({ success: true, token: LOGIN_TOKEN });
    } else {
      return res.status(200).json({ success: false, error: '密码错误' });
    }
  }

  const cos = getCosClient();

  try {
    // ===== list =====
    if (action === 'list' || (req.method === 'GET' && !action)) {
      const ratings = await readRatings(cos);
      ratings.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      return res.status(200).json({ success: true, data: ratings });
    }

    // ===== save =====
    if (action === 'save' || (req.method === 'POST' && !action)) {
      const body = req.body || {};
      // 支持直接传 record 或整体作为 record
      const record = body.record || body;
      if (!record || !record.hotel) {
        return res.status(400).json({ success: false, error: '无效的评估数据' });
      }
      const ratings = await readRatings(cos);
      record.id = record.id || Date.now();
      record.savedAt = new Date().toLocaleString('zh-CN');
      ratings.push(record);
      await writeRatings(cos, ratings);
      return res.status(200).json({ success: true, id: record.id });
    }

    // ===== delete =====
    if (action === 'delete') {
      const body = req.body || {};
      const recordId = String(body.id || '');
      if (!recordId) {
        return res.status(400).json({ success: false, error: '缺少 id 参数' });
      }
      let ratings = await readRatings(cos);
      const before = ratings.length;
      ratings = ratings.filter(r => String(r.id) !== recordId);
      if (ratings.length === before) {
        return res.status(200).json({ success: false, error: '记录不存在' });
      }
      await writeRatings(cos, ratings);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, error: '未知 action: ' + action });

  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
