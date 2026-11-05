# 安师大宿舍电费查询接口分析

> 抓包与验证时间：2026-11-04 22:00–22:30（Asia/Shanghai）
> 设备：Android 手机（今日校园 9.9.26）
> 目标：为 AHNUoHand 的「宿舍电费」功能找出可复用的查询接口

---

## 1. 结论先说

电费数据**不在**今日校园自己的接口里，也不在供应商 `zztfly.com` 那套加密通道里，而是学校
**总务监管服务平台**（积成电子）的 H5 页面 + JSON 网关：

```
今日校园 ──(H5 容器)──▶ zongwu.ahnu.edu.cn/webzongwu/.../SchoolLOTTab.html
                              │  iframe 嵌套
                              ▼
                        H5SchoolLOTDianQuery.html
                              │  AJAX（POST 表单）
                              ▼
              https://zongwu.ahnu.edu.cn/gateway/sso/bbs/<Controller>/<Action>
```

这套接口可以直接从任意客户端调用，**不需要登录态、不需要 Cookie**，只需要：

1. 一个请求头签名 `HeadJson`（算法已知，见 §3）；
2. 报文体用固定口令做 AES 加密并加 `PWDDATA_` 前缀（口令已取得，见 §3）；
3. 知道学号（即页面上的「用户编号」）或房间编号（见 §4）。

已实测跑通并核对：`tools/zongwu/client.py` 输出的余额/电量与手机页面完全一致
（总余额 12.3400 元、总剩余 20.00 度、上月 100.00 度）。

---

## 2. 页面入口

手机上的电费入口在今日校园「电费充值」磁贴，实际加载的是：

```
http://zongwu.ahnu.edu.cn/webzongwu/views/app/Admin/SysPayRecord/H5SysPayRecordSuSheFeeAdd.html
    ?OrgNo=00110001
    &AreaID=5004
    &OperatorNo=<学号>
    &OperatorName=<姓名>
    &Time=20261104220947
    &Sign=<32 位签名>
```

- `OrgNo=00110001` 是安徽师范大学的机构号，全校统一。
- `AreaID` 是校区代码（`5004` 为主校区，`500xxx` 为下一级片区）。
- `OperatorNo` 就是**学号**（11 位数字）；H5 页面「用户编号」那一栏显示的就是它，
  `DetailByOperatorNo` 也只认这个号。
- `Time`/`Sign` 只影响页面能否打开，接口调用本身不校验它们。

「用电查询」标签页是另一层 iframe：

```
views/app/School/DXHQ/SchoolLOT/SchoolLOTTab.html?OperatorNo=<用户编号>
  ├─ H5SchoolLOTDianQuery.html?AreaID&HouseNo&RoomNo     宿舍电量查询
  ├─ H5SchoolLOT15DianQuery.html?...&Key=26               近 15 天照明/空调拆分
  ├─ H5SchoolLOTLouYuDianQuery.html                       楼宇用电
  └─ H5SchoolRoomShuiQuery.html                           宿舍用水
```

---

## 3. 鉴权与报文加密

### 3.1 请求头 `HeadJson`

```js
// layuiadmin/lib/view.js
if ("2" === authvalid) {
  t.AppID = setter.ClientAppID; // "00000001"
  t.Code = formatDate(new Date(), "yyyyMMddHHmmss");
  t.Sign = swapCase(hex_md5(t.Code + setter.ClientAppSecret)); // "abcdefg"
  xhr.setRequestHeader("HeadJson", JSON.stringify(t));
}
```

`swapCase` 把十六进制串里的字母大小写互换。所以：

```
Code = 本地时间 yyyyMMddHHmmss
Sign = swapCase(md5_hex(Code + "abcdefg"))
HeadJson: {"AppID":"00000001","Code":"20261104223000","Sign":"..."}
```

`AppID`/`ClientAppSecret` 来自 `layuiadmin/config.js` 的 `ClientAppID` / `ClientAppSecret`。
缺 `HeadJson` 时网关返回 `{"Msg":"HeadJson鉴权值不能为空!","State":"301"}`。

### 3.2 报文体 `PWDDATA_`

```js
// layuiadmin/lib/view.js
e.data.json =
  "PWDDATA_" + CryptoJS.AES.encrypt(e.data.json, window.RequestBodyAesKey());
```

- `CryptoJS.AES.encrypt(str, passphrase)` 是 **口令模式**：OpenSSL `Salted__` 格式，
  `key||iv = EVP_BytesToKey(MD5, salt, passphrase, 1 轮)`，AES-256-CBC + PKCS#7，
  输出 `base64("Salted__" + salt + ciphertext)`。
- `window.RequestBodyAesKey()` 的返回值在页面运行时读取（该函数不在任何静态 JS 里，
  由 `layui.element` 的定制版本产生），实际值：

  ```
  12345678cgg54321
  ```

  这是平台硬编码的弱口令，所有校区通用；若学校升级导致失效，需重新从页面运行时取一次
  （见 §7 的 CDP 方法）。

报文体就是 `json=PWDDATA_<base64>` 表单提交（`application/x-www-form-urlencoded`）。
响应体本身是明文 JSON；个别接口的 `Model` 会再套一层 `PWDDATA_`，需要同口令解密。

### 3.3 请求示例（可直接抄）

```python
import hashlib, json, datetime, requests
code = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
sign = hashlib.md5((code + "abcdefg").encode()).hexdigest().swapcase()
headers = {"HeadJson": json.dumps({"AppID": "00000001", "Code": code, "Sign": sign},
                                  separators=(",", ":"))}
# body = {"json": "PWDDATA_" + encrypt(json.dumps(payload))}
```

完整可用实现见 [`tools/zongwu/client.py`](../tools/zongwu/client.py)。

---

## 4. 接口清单

所有地址都相对 `https://zongwu.ahnu.edu.cn/gateway/sso/bbs/`，全部 `POST` 表单、`json=` 字段。
公共字段（`BaseModel`）：`TimeStamp:"", DBSrc:"10", bIsPage:true, pageIndex, iPageSize`。

| 用途              | 路径                                  | `Opt`                | 关键参数                                                                                                               | 返回要点                                |
| ----------------- | ------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 校区列表          | `Admin/BaseAreaTable/ClientAreaTable` | `SelectByParentNo`   | `ParentID`（顶层传 `5004` 或空）                                                                                       | `Model[]`：`AreaID`、`AreaName`         |
| 宿舍楼列表        | `Org/SchoolHouse/ClientSchoolHouse`   | `Select2`            | `OrgNo`、`AreaID`、`HouseType:"15"`                                                                                    | `Model[]`：`No`、`Name`                 |
| 房间列表          | `Org/SchoolRoom/ClientSchoolRoom`     | `Select2`            | `OrgNo`、`HouseNo`                                                                                                     | `Model[]`：`No`、`Name`                 |
| **按学号查房**    | `Org/SchoolRoom/ClientSchoolRoom`     | `DetailByOperatorNo` | `OrgNo`、`OptNo`（学号）、`pageIndex:0`                                                                                | `Model`：房间对象                       |
| **房间电费详情**  | `Org/SchoolRoom/ClientSchoolRoom`     | `Detail`             | `OrgNo`、`No`（房间编号）                                                                                              | `Model`：余额/电量/电价                 |
| **本月+上月统计** | `Org/SchoolLOT/ClientSchoolLOT`       | `DataCount`          | `OrgNo`、`Key:"28"`、`Like0:房间编号`                                                                                  | `Model[0]`，中文键                      |
| **区间每日明细**  | `Org/SchoolLOT/ClientSchoolLOT`       | `DataCount`          | `OrgNo`、`Key:"10"`、`Like1:AreaID`、`Like2:HouseNo`、`Like3:房间编号`、`sDate`、`eDate`、`FKey:"1000"`、`pageIndex:0` | `Model[]`：`日期`/`Count`/`剩余量`      |
| 区间照明/空调     | 同上                                  | `DataCount`          | 同上，`Key:"26"`                                                                                                       | `Model[]`：`日期`/`照明用电`/`空调用电` |

> `Key` 是服务端预置的查询模板编号：`10` 用量+剩余量、`26` 照明/空调拆分、`28` 月度汇总。

---

## 5. 字段字典（`Detail` 返回）

| 字段                              | 含义                      | 样例                        |
| --------------------------------- | ------------------------- | --------------------------- |
| `No`                              | 房间编号                  | `10000101`                  |
| `Name` / `HouseName` / `AreaName` | 房间号 / 楼名 / 校区      | `101` / `<楼名>` / `<校区>` |
| `RoomNameStr`                     | 完整房间名                | `<楼名>-1-2-101`            |
| `NumDianShengYuALL`               | 剩余电量合计（度）        | `20.00`                     |
| `NumDianBuyShengYu`               | 充值剩余电量（度）        | `14.20`                     |
| `NumDianBuZhuShengYu`             | 补助剩余电量（度）        | `5.80`                      |
| `AmountDianShengYuAll`            | 余额合计（元）            | `12.3400`                   |
| `AmountDianBuyShengYu`            | 充值余额（元）            | `8.3900`                    |
| `AmountDianUseShengYu`            | 补助余额（元）            | `3.9500`                    |
| `DianPrice`                       | 电价（元/度）             | `0.57`                      |
| `SumDianUse` / `SumDianBuy`       | 累计用电 / 累计购电（度） | `2000.00` / `2020.00`       |
| `ShuiPrice`                       | 水价（元/吨）             | `2.8`                       |

月度统计（`Key=28`）返回**中文键**：`上月用电`、`上月空调用电`、`上月照明用电`、
`当月用电`、`当月空调用电`、`当月照明用电`、`当月用电补助`、`当月用电充值`。

每日明细：`日期`、`Count`（用电量）、`剩余量`、`充值量`、`补助量`；
`Key=26` 时改为 `照明用电`、`空调用电`。

---

## 6. 输出示例（数值为占位）

```
余额        12.3400 元   （充值 8.3900 + 补助 3.9500）
剩余电量    20.00 度     （充值 14.20 + 补助 5.80）
电价        0.57 元/度
上月        100.00 度    （空调 30.00 / 照明 70.00）
本月        10.00 度     （空调 0 / 照明 10.00）
本月补助    30.00 度，充值 0.00 度
```

---

## 7. 复现步骤

```powershell
# 1) 直接查（PC 上即可，无需手机）
python tools/zongwu/client.py --operator-no 2020xxxxxxx

# 2) 按房间号查
python tools/zongwu/client.py --room 10000101
```

抓包/取证工具（本次逆向时写的，可复用）：

- `tools/mitm/campus_mitm.py` — 自建 HTTP/HTTPS 代理，`observe` 模式只记域名不破坏 App，
  `mitm` 模式自签证书解密；日志为 JSONL。
- `tools/mitm/cdp_eval.py` — 极简 Chrome DevTools 客户端，用来读页面运行时变量（这次就是靠它
  读出 `window.RequestBodyAesKey()`）。

从页面运行时重新取口令（学校改版时用）：

```powershell
adb shell am start -n com.android.browser/.BrowserActivity `
  -a android.intent.action.VIEW `
  -d "https://zongwu.ahnu.edu.cn/webzongwu/views/app/School/DXHQ/SchoolLOT/SchoolLOTTab.html?OperatorNo=<编号>"
adb shell "cat /proc/net/unix | grep devtools"        # 找到 browser_webview_devtools_remote_<pid>
adb forward tcp:9224 localabstract:browser_webview_devtools_remote_<pid>
python tools/mitm/cdp_eval.py --port 9224 --eval "String(window.RequestBodyAesKey())"
```

---

## 8. 风险与限制

- **弱密钥**：`12345678cgg54321` 是平台硬编码口令，属实现缺陷；学校升级可能更换，
  客户端应把它做成可配置项，失败时提示「接口已变更」而不是崩栈。
- **越权读取**：接口只凭学号返回房间余额，不校验调用者身份。学号本身可推断
  （年级 + 专业 + 序号），枚举成本极低，这条链路等于「输入任意学号即可看到该生住哪间寝室、
  余额多少」。**本项目只应查询用户本人寝室**，不要做批量查询，更不要提供「查同学电费」之类的
  功能，那既侵犯他人隐私，也可能触发学校风控。
- **频率**：未观察到明确限流，但建议本地缓存 60–300 秒，页面切换不重复请求。
- **明文 HTTP 页面**：H5 本体走 `http://`，接口走 `https://`。客户端只调用接口即可，不必加载页面。
- **合规**：只做「查询/展示」，不要复用 `CommonChargeMoney` 等充值接口去做代扣。

---

## 9. 在 AHNUoHand 中的实现

已按下面的结构落地（2026-11-04）：

| 文件                            | 职责                                                              |
| ------------------------------- | ----------------------------------------------------------------- |
| `src/lib/crypto.ts`             | MD5、AES-256-CBC、PKCS#7、`Salted__` 封装（与 CryptoJS 逐位一致） |
| `src/lib/electricity.ts`        | 网关协议（`HeadJson` 签名 + 报文加密）、四个查询、缓存与格式化    |
| `src/pages/ElectricityPage.tsx` | 绑定编号、余额卡片、月度对比、近 15 天柱状图、刷新/换号           |
| `src/App.tsx`                   | `feature === "electricity"` 时路由到电费页                        |

关键取舍：**请求放在前端 `fetch`，而不是 Rust 侧 `reqwest`**。

- 学校网关会重置非浏览器 TLS 指纹的握手（rustls 直接连会被 RST，实测 python/OpenSSL 与浏览器正常）；
  用 WebView 的网络栈天然是浏览器指纹。
- 网关注明了 `Access-Control-Allow-Origin: *`，并放行 `headjson` 请求头，跨域可行（`OPTIONS` 返回 204）。
- 代价是 AES 口令进入前端包体。它原本就是学校公开 JS 里的常量，不构成额外泄露；
  若学校更换口令，只需改 `src/lib/electricity.ts` 的 `BODY_KEY`。

验证方式（不需要启动 Tauri）：

```powershell
node tools/crypto-vectors.test.ts                      # 7 项密码学向量
$env:AHNU_OPERATOR_NO = "<学号>"
node tools/electricity-smoke.ts                        # 真实网关联调
```

其余约定：编号与缓存存在 `localStorage`（`ahnu.electricity.*`），TTL 5 分钟；
只查询用户本人寝室，不做枚举。
