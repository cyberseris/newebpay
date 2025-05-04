var express = require('express');
var router = express.Router();

/* 取得用戶清單 */
router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

module.exports = router;
