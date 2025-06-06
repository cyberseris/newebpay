const express = require('express');
const router = express.Router();
const crypto = require('crypto');
require('dotenv').config();

const orders = {};

const {
  MerchantID,
  HASHKEY,
  HASHIV,
  Version,
  PayGateWay,
  NotifyUrl,
  ReturnUrl,
} = process.env;
const RespondType = 'JSON';

// 建立訂單
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Express' });
});
router.post('/createOrder', (req, res) => {
  const data = req.body;
  console.log(data); //Email, Amt, ItemDesc(訂購商品)

  // 使用 Timestamp 作為訂單編號（金流也需要加入時間戳記）
  const TimeStamp = Math.round(new Date().getTime() / 1000);
  const order = {
    ...data,
    TimeStamp,
    Amt: parseInt(data.Amt),
    MerchantOrderNo: TimeStamp,
  };

  // 進行訂單加密
  // 加密第一段字串，此段主要是提供交易內容給予藍新金流
  const aesEncrypt = createSesEncrypt(order);

  // 使用 HASH 再次 SHA 加密字串，作為驗證使用
  const shaEncrypt = createShaEncrypt(aesEncrypt);
  order.aesEncrypt = aesEncrypt;
  order.shaEncrypt = shaEncrypt;

  orders[TimeStamp] = order;

  res.redirect(`/check/${TimeStamp}`);
});

router.get('/check/:id', (req, res, next) => {
  const { id } = req.params; //TimeStamp
  const order = orders[id];
  console.log(order);
  res.render('check', {
    title: 'Express',
    PayGateWay,
    Version,
    order,
    MerchantID,
    NotifyUrl,
    ReturnUrl,
  });
});

// 交易成功：Return （可直接解密，將資料呈現在畫面上）
router.post('/newebpay_return', function (req, res, next) {
  console.log("====================newebpay_return====================")
  console.log('/newebpay_return', req.body);
  console.log("====================newebpay_return====================")
  res.render('success', { title: 'Express' });
});

// 確認交易：Notify
router.post('/newebpay_notify', function (req, res, next) {
  const response = req.body;
  console.log("====================newebpay_notify====================")
  console.log('/newebpay_notify', req.body);
  console.log("====================newebpay_notify====================")
  // 解密交易內容
  const data = createAesDecrypt(response.TradeInfo);
  console.log("====================newebpay_notify data====================")
  console.log('data:', data);
  console.log("====================newebpay_notify data====================")

  console.log("====================newebpay_notify orders====================")
  // 取得交易內容，並查詢本地端資料庫是否有相符的訂單
  console.log(orders[data?.Result?.MerchantOrderNo]);
  console.log("====================newebpay_notify orders====================")
  if (!orders[data?.Result?.MerchantOrderNo]) {
    console.log('找不到訂單');
    return res.end();
  }

  // 使用 HASH 再次 SHA 加密字串，確保比對一致（確保不正確的請求觸發交易成功）
  const thisShaEncrypt = createShaEncrypt(response.TradeInfo);
  if (!thisShaEncrypt === response.TradeSha) {
    console.log('付款失敗：TradeSha 不一致');
    return res.end();
  }

  // 交易完成，將成功資訊儲存於資料庫
  console.log('付款完成，訂單： ', orders[data?.Result?.MerchantOrderNo]);
  
  return res.end();
});

// 字串組合
function genDataChain(order) {
  return `MerchantID=${MerchantID}&TimeStamp=${
    order.TimeStamp
  }&Version=${Version}&RespondType=${RespondType}&MerchantOrderNo=${
    order.MerchantOrderNo
  }&Amt=${order.Amt}&NotifyURL=${encodeURIComponent(
    NotifyUrl,
  )}&ReturnURL=${encodeURIComponent(ReturnUrl)}&ItemDesc=${encodeURIComponent(
    order.ItemDesc,
  )}&Email=${encodeURIComponent(order.Email)}`;
}


// 對應文件 P17：使用 aes 加密
// $edata1=bin2hex(openssl_encrypt($data1, "AES-256-CBC", $key, OPENSSL_RAW_DATA, $iv));
function createSesEncrypt(TradeInfo) {
  const encrypt = crypto.createCipheriv('aes256', HASHKEY, HASHIV);
  const enc = encrypt.update(genDataChain(TradeInfo), 'utf8', 'hex');
  return enc + encrypt.final('hex');
}

// 對應文件 P18：使用 sha256 加密
// $hashs="HashKey=".$key."&".$edata1."&HashIV=".$iv;
function createShaEncrypt(aesEncrypt) {
  const sha = crypto.createHash('sha256');
  const plainText = `HashKey=${HASHKEY}&${aesEncrypt}&HashIV=${HASHIV}`;

  return sha.update(plainText).digest('hex').toUpperCase();
}

// 對應文件 21, 22 頁：將 aes 解密
function createAesDecrypt(TradeInfo) {
  const decrypt = crypto.createDecipheriv('aes256', HASHKEY, HASHIV);
  decrypt.setAutoPadding(false);
  const text = decrypt.update(TradeInfo, 'hex', 'utf8');
  const plainText = text + decrypt.final('utf8');
  const result = plainText.replace(/[\x00-\x20]+/g, '');
  return JSON.parse(result);
}

module.exports = router;
