/**
 * 真实接口冒烟测试（不启动 Tauri，直接用 Node 的 fetch 打学校网关）。
 *
 *   $env:AHNU_OPERATOR_NO = "<电费用户编号>"
 *   node tools/electricity-smoke.ts
 *
 * 只打印结构信息，不打印余额、房间号等个人数据。
 */

import { fetchElectricity } from "../src/lib/electricity.ts";

const operatorNo = process.env.AHNU_OPERATOR_NO?.trim();
if (!operatorNo) {
  console.error("请先设置 AHNU_OPERATOR_NO 环境变量");
  process.exit(1);
}

try {
  const report = await fetchElectricity(operatorNo, 5);
  console.log("查询成功：");
  console.log(`  room_no_len      = ${report.room.no.length}`);
  console.log(`  house_ok         = ${report.room.house.length > 0}`);
  console.log(`  price_positive   = ${report.balance.price > 0}`);
  console.log(`  kwh_positive     = ${report.balance.kwhLeft > 0}`);
  console.log(`  daily_rows       = ${report.daily.length}`);
  console.log(
    `  month_keys_ok    = ${report.month.lastMonthKwh >= 0 && report.month.thisMonthKwh >= 0}`,
  );
  console.log(`  first_daily_date = ${report.daily[0]?.date ?? "(none)"}`);
} catch (error) {
  console.error("查询失败：", error instanceof Error ? error.message : error);
  process.exit(1);
}
