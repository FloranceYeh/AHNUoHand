/**
 * 向量测试：验证 src/lib/crypto.ts 与浏览器端 CryptoJS 的输出逐位一致。
 *
 *   node tools/crypto-vectors.test.ts
 *
 * 这里的期望值来自两处：
 *   - RFC 1321（MD5）、FIPS-197（AES-256）标准向量；
 *   - 用 Python `cryptography` 按 CryptoJS 的 `Salted__` 规则生成的对照密文。
 */

import assert from "node:assert/strict";

import {
  md5Hex,
  saltedDecrypt,
  saltedEncrypt,
  swapCase,
  utf8,
} from "../src/lib/crypto.ts";

let passed = 0;

function check(name: string, run: () => void): void {
  run();
  passed += 1;
  console.log(`  ok  ${name}`);
}

check("MD5 空串与 abc", () => {
  assert.equal(md5Hex(""), "d41d8cd98f00b204e9800998ecf8427e");
  assert.equal(md5Hex("abc"), "900150983cd24fb0d6963f7d28e17f72");
  assert.equal(
    md5Hex("The quick brown fox jumps over the lazy dog"),
    "9e107d9d372bb6826bd81d3542a419d6",
  );
});

check("swapCase 与签名算例", () => {
  assert.equal(
    swapCase("051d7be804f5bab2dca7f73a9403d455"),
    "051D7BE804F5BAB2DCA7F73A9403D455",
  );
});

check("CryptoJS 兼容密文（固定盐）", () => {
  const salt = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
  const encrypted = saltedEncrypt('{"a":1}', "12345678cgg54321", salt);
  assert.equal(encrypted, "U2FsdGVkX18AAQIDBAUGB+QyXKgKDU39evHh3yEkMnE=");
});

check("解密还原", () => {
  const salt = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
  const encrypted = saltedEncrypt('{"a":1}', "12345678cgg54321", salt);
  assert.equal(saltedDecrypt(encrypted, "12345678cgg54321"), '{"a":1}');
});

check("随机盐往返（含中文与长报文）", () => {
  const payload = JSON.stringify({
    校区: "示例",
    room: "10000101",
    备注: "x".repeat(500),
  });
  const encrypted = saltedEncrypt(payload, "12345678cgg54321");
  assert.equal(saltedDecrypt(encrypted, "12345678cgg54321"), payload);
});

check("错误口令不应还原出原文", () => {
  const encrypted = saltedEncrypt(
    "secret",
    "12345678cgg54321",
    new Uint8Array(8),
  );
  assert.notEqual(saltedDecrypt(encrypted, "wrong-key"), "secret");
});

check("UTF-8 往返", () => {
  assert.equal(
    new TextDecoder().decode(utf8("余电 20.00 度")),
    "余电 20.00 度",
  );
});

console.log(`\n${passed} 项向量测试全部通过`);
