/**
 * 从已登录的课表页面提取课程，再用 timetable.ts 的解析器归一化。
 *
 * 依赖的页面结构（EAMS 打印视图，实测于 jw.ahnu.edu.cn）：
 *
 *   table
 *     thead > tr > th[星期一..星期日]
 *     tbody > tr > td.dayPartUnit(节次) + td.td-content.{星期号}(rowspan=跨节数)
 *                    > div.tdHtml（课程文本）
 *
 * 这段脚本以字符串形式注入到目标页面执行，因此不能引用外部模块。
 */

export const EXTRACT_SCRIPT = String.raw`
(() => {
  const cell = document.querySelector('td.td-content, td[class*="td-content"]');
  if (!cell) return JSON.stringify({ error: 'no-grid' });

  const table = cell.closest('table');
  const head = table.tHead && table.tHead.rows[0]
    ? [...table.tHead.rows[0].cells].map((c) => c.innerText.trim()).filter(Boolean)
    : [];

  const raw = [];
  for (const tr of table.rows) {
    const unit = tr.querySelector('td.dayPartUnit');
    if (!unit) continue;
    const period = Number.parseInt(unit.innerText.trim(), 10);
    if (!Number.isFinite(period)) continue;

    for (const td of tr.cells) {
      if (!td.classList.contains('td-content') && !td.className.includes('td-content')) continue;
      const weekdayClass = [...td.classList].find((name) => /^[1-7]$/.test(name));
      const match = weekdayClass ? [weekdayClass, weekdayClass] : /(?:^|\s)([1-7])(?:\s|$)/.exec(td.className || '');
      if (!match) continue;
      const box = td.querySelector('.tdHtml') || td;
      if (!box) continue;
      const text = (box.innerText || box.textContent || '').replace(/\u00a0/g, ' ').trim();
      if (!text) continue;
      raw.push({
        weekday: Number(match[1]),
        period,
        span: td.rowSpan || 1,
        text,
      });
    }
  }

  const bodyText = (document.body.innerText || '').replace(/\u00a0/g, ' ');

  // 学期起始日期：页头形如「起始日期2026-08-31」
  let startDate = '';
  const startMatch = /起始日期\s*[:：]?\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(bodyText);
  if (startMatch) {
    const pad = (n) => String(n).padStart(2, '0');
    startDate = startMatch[1] + '-' + pad(startMatch[2]) + '-' + pad(startMatch[3]);
  }

  // 节次时间：左侧时间列里的 hh:mm 按顺序配对
  const times = [];
  for (const td of table.querySelectorAll('td.timeArea, td.timeAreaTd, td.timearea')) {
    const found = ((td.innerText || '').replace(/\u00a0/g, ' ').match(/\d{1,2}:\d{2}/g) || []);
    times.push(...found);
  }

  const remark = document.querySelector('.course-table-remark');
  const semester = document.querySelector('#allSemesters option:checked') || document.querySelector('#allSemesters option[selected]');
  return JSON.stringify({
    head,
    cells: raw,
    remark: remark ? remark.innerText.replace(/\u00a0/g, ' ').trim() : '',
    semester: semester ? (semester.innerText || semester.textContent || '').trim() : '',
    startDate,
    times,
  });
})()
`;
