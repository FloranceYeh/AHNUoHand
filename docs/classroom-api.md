# 空教室查询接口分析

> 抓包时间：2026-11-05（Asia/Shanghai）
> 目标：为 AHNUoHand 的「空教室」功能找出可复用的查询接口

---

## 1. 结论

空教室是今日校园里一个独立的 H5 应用，**不在**网上办事大厅（`ahnu.campusphere.net`）的服务列表里：

```
今日校园 ──H5 容器──▶ https://ybt.ahnu.edu.cn/zhxyH5/pagesA/view/home/queryApp/emptyClassRoom
                            │  AJAX（同源，带 X-Access-Token）
                            ▼
                 https://ybt.ahnu.edu.cn/zhxyApi/rhpt-applets/kjs/api/...
```

- 站点 `ybt.ahnu.edu.cn` **公网可访问**（蜂窝数据下也能查），但 nginx 在 TLS 握手缺少 ALPN
  时会直接掐连接，用 Python `requests`/curl 直连会得到 `SSLError`；设置 `ALPN=http/1.1` 即正常。
- 鉴权用 `X-Access-Token`（JWT），由 **CAS 票据**换取；字典接口无需登录。
- 该站点对 `http://tauri.localhost` 这类来源**放行 CORS**（`Access-Control-Allow-Origin` 回显来源，
  并允许 `x-access-token` 请求头），因此客户端可以直接 `fetch`，不必经过后端转发。

---

## 2. 登录链路

```
1. 打开  https://ids.ahnu.edu.cn/authserver/login?service=<ybt H5 地址>
2. 用户登录后，CAS 回跳  https://ybt.ahnu.edu.cn/zhxyH5/?ticket=ST-xxxx
3. 换取令牌  GET /zhxyApi/cas/client/validateLogin?ticket=ST-xxxx&service=<ybt H5 地址>
              → {"success":true,"result":{"token":"<JWT>","userInfo":{...}}}
4. 后续业务请求带  X-Access-Token: <JWT>
```

- 票据一次性、有有效期；`validateLogin` 对无效票据返回
  `{"success":false,"message":"登录超时，重新登录"}`。
- 令牌失效时业务接口返回 `{"status":500,"message":"Token失效，请重新登录"}`。

---

## 3. 接口清单

基址 `https://ybt.ahnu.edu.cn/zhxyApi`。

| 用途             | 方法 | 路径                                                    | 需要令牌 |
| ---------------- | ---- | ------------------------------------------------------- | -------- |
| 周次字典         | GET  | `/sys/dict/getDictItems/school_zc`                      | 否       |
| 星期字典         | GET  | `/sys/dict/getDictItems/school_zc_xq`                   | 否       |
| 节次字典         | GET  | `/sys/dict/getDictItems/school_zc_xq_jc`                | 否       |
| 当前学年/周次    | GET  | `/rhpt-applets/kjs/api/getNowZcAndXq`                   | 是       |
| 楼栋列表         | GET  | `/rhpt-applets/kjs/api/getSchoolLhCode?xqName=<校区名>` | 是       |
| **空闲教室查询** | GET  | `/rhpt-applets/kjs/api/getDataBy`                       | 是       |

### `getDataBy` 参数

| 参数                                | 含义           | 示例      |
| ----------------------------------- | -------------- | --------- |
| `zcCode`                            | 周次           | `10`      |
| `zcXqCode`                          | 星期           | `星期四`  |
| `zcXqJcCodeBegin` / `zcXqJcCodeEnd` | 节次范围，可空 | `1` / `4` |
| `lhCode`                            | 楼栋代码       | `101`     |
| `xqCode`                            | 校区代码       | `1`       |

返回：

```json
{
  "success": true,
  "code": 200,
  "result": [
    {
      "js_name": "教学楼1510",
      "kxjc": "1,2,3,4,5,6,7,8,9,10,11,12,13",
      "lh_name": "教学楼",
      "type": "1"
    }
  ]
}
```

`js_name` 教室名，`kxjc` 为空闲节次（逗号分隔），`lh_name` 楼名。

### 校区与楼栋

| 校区       | `xqCode` | 楼栋示例（`lhCode`）     |
| ---------- | -------- | ------------------------ |
| 赭山校区   | `1`      | 教学楼 `101`、田楼 `102` |
| 花津校区   | `2`      | 1号教学楼 `201` …        |
| 天门山校区 | `3`      | 北教学楼 `301` …         |

楼栋代码首位数与校区一致，具体列表以 `getSchoolLhCode` 返回为准。

### `getNowZcAndXq` 返回

```json
{
  "XN": "2026-2027",
  "XQ": "1",
  "ZC": "10",
  "xqj": "星期四",
  "KSRQ": "2026-11-02",
  "JSRQ": "2026-11-08"
}
```

即可直接用于初始化「当前周 / 今天」。

---

## 4. 项目内的实现

| 文件                          | 职责                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `src/lib/classroom.ts`        | 登录（CAS 票据换 token）、字典、楼栋、查询、节次格式化                         |
| `src/pages/ClassroomPage.tsx` | 校区/楼栋/周次/星期选择，结果列表                                              |
| `src-tauri/src/classroom.rs`  | 打开 CAS 登录窗口，用 `on_navigation` 截获回跳地址里的 `ticket` 并通过事件回传 |

登录窗口由 Rust 侧创建，**密码只在学校的页面里输入**，不经过本应用；Rust 只从跳转 URL 里取票据。

---

## 5. 限制与合规

- 令牌是个人凭证，只保存在本机 `localStorage`（`ahnu.classroom.token`），退出登录即清除。
- 数据由学校按课程表推算，页面自述「12 小时更新一次，不排除调课情况」，仅作参考。
- 只做查询展示，不做预约、占座或批量抓取。
- 抓包时临时安装的 `Campus Capture CA` 用完应删除，否则本机流量有被中间人解密的可能。
