# 课程表接口分析

> 抓包时间：2026-11-05（Asia/Shanghai）
> 目标：为 AHNUoHand 的「课程表」功能找出可复用的数据来源

---

## 1. 结论

课程表来自**新版教务系统 EAMS**（`jw.ahnu.edu.cn`），与之前的空教室（`ybt`，一站式大厅）、电费（`zongwu`，后勤）是**三套完全独立**的系统。

- `jw.ahnu.edu.cn` **公网可直连**，无需 WebVPN。
- 与 `ybt` 一样，nginx 在 TLS 握手缺少 ALPN 时会掐连接，脚本请求需设 `ALPN=http/1.1`。
- **登录必须过图形验证码**，无法后台静默完成，因此只能由用户在 WebView 窗口里自行登录。
- 课表页的**打印视图**才渲染完整网格，主视图只加载数据不渲染 DOM。

---

## 2. 登录链路

```
1. GET  /student/login-salt          → 一串 UUID 盐
2. password = SHA1(salt + "-" + 明文密码)
3. POST /student/login
       {"username":"<学号>","password":"<上一步结果>","captcha":"<验证码>"}
       → {"result": true}  成功后跳 /student/home
4. 会话靠 cookie 维持，浏览器/WebView 自动携带
```

验证码图片地址：`GET /student/login-captcha?d=<时间戳>`

因为要人工看图输入，客户端**不保存密码**，只让用户在独立窗口里登录，登录态留在 WebView 自己的 cookie 罐里。

---

## 3. 课表页面结构

```
/student/for-std/course-table                      ← 主视图，不渲染网格
/student/for-std/course-table/semester/<id>/print  ← 打印视图，渲染完整网格
```

打印视图的 DOM：

```html
<table>
  <thead>
    <tr>
      <th></th>
      <th>星期一</th>
      …
      <th>星期日</th>
    </tr>
  </thead>
  <tbody>
    <tr class="1">
      <td class="timeArea" rowspan="5">08:00 …</td>
      <td class="dayPartUnit">1</td>
      <td class="td-content 1" rowspan="2"><div class="tdHtml">…</div></td>
      <td class="td-content 2" rowspan="2">…</td>
      …
    </tr>
  </tbody>
</table>
```

- `td.dayPartUnit`：节次序号
- `td.td-content {1..7}`：星期几（`1` = 周一）
- `rowspan`：这节课占几节
- `div.tdHtml`：课程文本

### 单元格文本格式

```
示例课程甲 001
(1~16周) (800-935) 某楼101 某老师
```

同一格排多段时，后面的段落以 `(` 开头继续：

```
示例课程乙 060
(2周) (950-1125) 某楼201 某老师
(5周) (3-4节) 某楼202 某老师
```

解析时按「以 `(…周)` 开头」分段，再分别取出周次、时间、地点、教师。

> 部分教室名会带结尾的 `*`（如 `某楼8102*`），教务系统页面上没有图例说明其含义，本项目的解析**保留原样**，未做处理。

---

## 4. 其他数据来源（不可用）

| 来源                                  | 情况                                                                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ybt.ahnu.edu.cn` 的「我的课表」      | 接口存在（`applets/week/timetable/studentTimetable`），但学校未往该模块灌数据，`get/nowTerm` 返回「未设置学年学期」，页面空白 |
| `mjwgl.ahnu.edu.cn`（旧版移动端教务） | 校外访问返回 403，按来源 IP 限制                                                                                              |
| WebVPN 代理                           | 可用但没必要，`jw` 本身公网可达                                                                                               |

网上广泛流传的 `mjwgl` + `PHPSESSID` 方案（如 [abersheeran/Ahnu](https://github.com/abersheeran/Ahnu)）在 2018 年有效，现在校外已不可用。

---

## 5. 项目内的实现

| 文件                          | 职责                                     |
| ----------------------------- | ---------------------------------------- |
| `src/lib/timetable.ts`        | 课程数据结构、单元格文本解析、配色       |
| `src/lib/timetableExtract.ts` | 注入目标页面的抽取脚本                   |
| `src/lib/timetableSession.ts` | 登录窗口、轮询登录状态、跳打印视图取数   |
| `src/lib/semester.ts`         | 首周、当前周、周与日期互转（与校历共用） |
| `src/lib/periodSchedule.ts`   | 夏令时 / 冬令时作息时间表                |
| `src/pages/TimetablePage.tsx` | 周视图，滑动切周，课程卡片与详情         |
| `src-tauri/src/windows.rs`    | 开窗、执行脚本取回结果、跳转、关闭       |

### 两个踩过的坑

**一、不能用 `on_navigation` 判断登录成功。**
WebView2 对 JS 发起的跳转（`location.href`、history API）**不保证触发导航回调**，而 EAMS 登录成功后恰恰多用这些方式。改为**轮询窗口当前地址**，任何跳转方式都能捕捉。

**二、教务菜单是 `window.open` / `target=_blank`。**
Tauri 默认丢弃这类新窗口请求，表现为「登录后点什么都没反应、动画还在」。用 `on_new_window` 拦截后改为同窗口打开：

```rust
.on_new_window(move |next, _features| {
    if let Some(wv) = handle.get_webview_window(&label) {
        let _ = wv.navigate(next);
    }
    tauri::webview::NewWindowResponse::Deny
})
```

---

## 6. 限制与合规

- 会话只存在于登录窗口的 cookie 中，应用不保存学号密码。
- 课表数据缓存在本机 `localStorage`（`ahnu.timetable.grid`），仅用于避免重复登录。
- 只做查询展示，不做选课、抢课或批量抓取。
- 数据以教务系统为准，本应用仅做展示与周次换算。
